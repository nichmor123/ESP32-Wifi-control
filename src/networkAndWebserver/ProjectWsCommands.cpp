#include "networkAndWebserver/ProjectWsCommands.h"
#include "networkAndWebserver/WsCommandServer.h"

#include <Arduino.h>
#include <ArduinoJson.h>

#include <FS.h>
#include <LittleFS.h>

#include "freertos/FreeRTOS.h"
#include "freertos/portmacro.h"

static ChannelBus g_bus;
static portMUX_TYPE g_busMux = portMUX_INITIALIZER_UNLOCKED;

// ---- helpers ----

static inline float clampf(float x, float lo, float hi) {
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
}

static void set_channels_from_array(JsonVariantConst arr) {
    for (uint8_t i = 0; i < ChannelBus::N; i++) {
        if (arr[i].isNull()) break;
        float v = arr[i].as<float>();
        g_bus.ch[i] = clampf(v, -1.0f, 1.0f);
    }
}

static void set_channels_from_Ckeys(JsonVariantConst data) {
    char key[6]; // "C255" + null
    for (uint8_t i = 0; i < ChannelBus::N; i++) {
        snprintf(key, sizeof(key), "C%u", (unsigned)(i + 1));
        if (!data[key].isNull()) {
            float v = data[key].as<float>();
            g_bus.ch[i] = clampf(v, -1.0f, 1.0f);
        }
    }
}

static bool ensureLittleFS() {
    static bool mounted = false;
    if (mounted) return true;

    // do NOT format automatically here
    if (!LittleFS.begin(false)) return false;
    mounted = true;
    return true;
}

static bool writeRawFileAtomic(const char* path, const char* text) {
    const char* tmpPath = "/controlmap.tmp";

    {
        File f = LittleFS.open(tmpPath, "w");
        if (!f) return false;
        size_t n = f.print(text);
        f.flush();
        f.close();
        if (n == 0) {
            LittleFS.remove(tmpPath);
            return false;
        }
    }

    LittleFS.remove(path);
    if (!LittleFS.rename(tmpPath, path)) {
        LittleFS.remove(tmpPath);
        return false;
    }
    return true;
}

static bool writeJsonAtomic(const char* path, JsonVariantConst json) {
    const char* tmpPath = "/controlmap.tmp";

    {
        File f = LittleFS.open(tmpPath, "w");
        if (!f) return false;
        if (serializeJson(json, f) == 0) {
            f.close();
            LittleFS.remove(tmpPath);
            return false;
        }
        f.flush();
        f.close();
    }

    LittleFS.remove(path);
    if (!LittleFS.rename(tmpPath, path)) {
        LittleFS.remove(tmpPath);
        return false;
    }
    return true;
}

static bool loadJsonFile(const char* path, JsonDocument& outDoc) {
    File f = LittleFS.open(path, "r");
    if (!f) return false;
    DeserializationError err = deserializeJson(outDoc, f);
    f.close();
    return !err;
}

// ---- handlers ----

static void cmd_ping(AsyncWebSocketClient* client, JsonVariantConst, JsonDocument&) {
    client->text("{\"cmd\":\"pong\"}");
}

static void cmd_set_inputs(AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument&) {
    const uint32_t now = millis();

    portENTER_CRITICAL(&g_busMux);

    if (!data["ch"].isNull() && data["ch"].is<JsonArrayConst>()) {
        set_channels_from_array(data["ch"]);
    } else {
        set_channels_from_Ckeys(data);
    }

    g_bus.lastRxMs = now;

    portEXIT_CRITICAL(&g_busMux);

    client->text("{\"ok\":true}");
}

// Save mapping into /controlmap.json
static void cmd_save_input_mapping(AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument&) {
    // Supported forms:
    // A) {"cmd":"save_input_mapping","data":{"controlMapText":"{...json text...}"}}
    // B) {"cmd":"save_input_mapping","data":{"controlMap":{...json object...}}}
    // C) {"cmd":"save_input_mapping","data":{"map_to_channels":[...]}}   (patch existing file)

    if (!ensureLittleFS()) {
        client->text("{\"ok\":false,\"err\":\"littlefs_not_mounted\"}");
        return;
    }

    const char* path = "/controlmap.json";

    // A) Recommended: raw JSON text (avoids big nested parsing)
    if (!data["controlMapText"].isNull() && data["controlMapText"].is<const char*>()) {
        const char* text = data["controlMapText"].as<const char*>();
        bool ok = writeRawFileAtomic(path, text);
        client->text(ok ? "{\"ok\":true}" : "{\"ok\":false,\"err\":\"write_failed\"}");
        return;
    }

    // B) Full object
    if (!data["controlMap"].isNull() && data["controlMap"].is<JsonObjectConst>()) {
        bool ok = writeJsonAtomic(path, data["controlMap"]);
        client->text(ok ? "{\"ok\":true}" : "{\"ok\":false,\"err\":\"write_failed\"}");
        return;
    }

    // C) Patch only inputs.map_to_channels
    if (!data["map_to_channels"].isNull() && data["map_to_channels"].is<JsonArrayConst>()) {
        // This buffer only needs to hold the existing controlmap + new mapping list.
        // If you later add lots of outputs/etc, bump this.
        StaticJsonDocument<24576> doc;
        if (!loadJsonFile(path, doc)) {
            client->text("{\"ok\":false,\"err\":\"load_controlmap_failed\"}");
            return;
        }

        JsonObject inputs = doc["inputs"].to<JsonObject>();
        if (inputs.isNull()) inputs = doc.createNestedObject("inputs");

        inputs.remove("map_to_channels");
        JsonArray dst = inputs.createNestedArray("map_to_channels");

        for (JsonVariantConst v : data["map_to_channels"].as<JsonArrayConst>()) {
            dst.add(v);
        }

        bool ok = writeJsonAtomic(path, doc.as<JsonVariantConst>());
        client->text(ok ? "{\"ok\":true}" : "{\"ok\":false,\"err\":\"write_failed\"}");
        return;
    }

    client->text("{\"ok\":false,\"err\":\"bad_request\"}");
}

// ---- registration ----

void RegisterProjectWsCommands(WsCommandServer& ws) {
    Serial.println("Registering WS commands...");
    ws.on("ping", cmd_ping);
    ws.on("set_inputs", cmd_set_inputs);
    ws.on("save_input_mapping", cmd_save_input_mapping);
}

ChannelBus GetChannelBusSnapshot() {
    portENTER_CRITICAL(&g_busMux);
    ChannelBus copy = g_bus;
    portEXIT_CRITICAL(&g_busMux);
    return copy;
}