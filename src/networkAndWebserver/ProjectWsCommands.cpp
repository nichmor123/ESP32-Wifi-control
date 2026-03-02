#include "networkAndWebserver/ProjectWsCommands.h"
#include "networkAndWebserver/WsCommandServer.h"

#include <Arduino.h>
#include <ArduinoJson.h>

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
    // arr: JSON array of floats
    for (uint8_t i = 0; i < ChannelBus::N; i++) {
        if (arr[i].isNull()) break;
        float v = arr[i].as<float>();
        g_bus.ch[i] = clampf(v, -1.0f, 1.0f);
    }
}

static void set_channels_from_Ckeys(JsonVariantConst data) {
    // Legacy keys: C1..CN (scales with N)
    // Note: key buffer supports C1..C255 with N uint8_t.
    char key[6]; // "C255" + null
    for (uint8_t i = 0; i < ChannelBus::N; i++) {
        snprintf(key, sizeof(key), "C%u", (unsigned)(i + 1));
        if (!data[key].isNull()) {
            float v = data[key].as<float>();
            g_bus.ch[i] = clampf(v, -1.0f, 1.0f);
        }
    }
}

// ---- handlers ----

static void cmd_ping(AsyncWebSocketClient* client, JsonVariantConst, JsonDocument&) {
    client->text("{\"cmd\":\"pong\"}");
}

static void cmd_set_inputs(AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument&) {
    // Supports either:
    // A) {"cmd":"set_inputs","data":{"ch":[...N floats...]}}
    // B) {"cmd":"set_inputs","data":{"C1":..., "C2":..., ... "CN":...}}  (legacy)
    //
    // Channel range assumed: -1.0 .. +1.0

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

// ---- public API ----

void RegisterProjectWsCommands(WsCommandServer& ws) {
    Serial.println("Registering WS commands...");
    ws.on("ping", cmd_ping);
    ws.on("set_inputs", cmd_set_inputs);
}

ChannelBus GetChannelBusSnapshot() {
    portENTER_CRITICAL(&g_busMux);
    ChannelBus copy = g_bus;
    portEXIT_CRITICAL(&g_busMux);
    return copy;
}