#include "ProjectWsCommands.h"
#include "WsCommandServer.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include <LittleFS.h>

// --- Global state for channel data ---
static ChannelBus g_channelBus;
static portMUX_TYPE g_channelBusMutex = portMUX_INITIALIZER_UNLOCKED;

// --- Handler Implementations ---

// For thread-safe access from the main loop()
ChannelBus GetChannelBusSnapshot() {
    ChannelBus snapshot;
    portENTER_CRITICAL(&g_channelBusMutex);
    snapshot = g_channelBus;
    portEXIT_CRITICAL(&g_channelBusMutex);
    return snapshot;
}

// Handler for binary control packets
static void handleBinary(AsyncWebSocketClient* client, const uint8_t* data, size_t len) {
    if (len < 4 || data[0] != 'U' || data[1] != 'C' || data[2] != 1) {
        return; // Invalid packet
    }
    const uint8_t numChannels = data[3];
    if (len != (4 + numChannels * 2)) {
        return; // Malformed packet
    }

    portENTER_CRITICAL(&g_channelBusMutex);
    g_channelBus.lastRxMs = millis();
    for (uint8_t i = 0; i < numChannels && i < ChannelBus::N; ++i) {
        int16_t val_i16;
        memcpy(&val_i16, &data[4 + i * 2], 2);
        g_channelBus.ch[i] = val_i16 / 1000.0f;
    }
    // Zero out remaining channels if packet is smaller than N
    for (uint8_t i = numChannels; i < ChannelBus::N; ++i) {
        g_channelBus.ch[i] = 0.0f;
    }
    portEXIT_CRITICAL(&g_channelBusMutex);
}

// Handler for saving controlMap.json
static void handleSaveInputMapping(AsyncWebSocketClient* client, JsonVariantConst data) {
    if (!data.is<JsonObjectConst>()) { // Check if the variant is actually an object
        client->text("{\"cmd\":\"save_input_mapping_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"data is not an object\"}}");
        return;
    }
    JsonObjectConst obj = data.as<JsonObjectConst>(); // Use JsonObjectConst for read-only access

    // Check if "controlMapText" exists and is a const char*
    if (!obj["controlMapText"].is<const char*>()) {
        client->text("{\"cmd\":\"save_input_mapping_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"controlMapText missing or not string\"}}");
        return;
    }
    const char* mapText = obj["controlMapText"];

    File file = LittleFS.open("/controlMap.json", "w");
    if (!file) {
        client->text("{\"cmd\":\"save_input_mapping_err\",\"data\":{\"status\":\"fs_error\"}}");
        return;
    }
    file.print(mapText);
    file.close();

    client->text("{\"cmd\":\"save_input_mapping_ok\",\"data\":{\"status\":\"ok\"}}");
}

static void handleSaveBatteryConfig(AsyncWebSocketClient* client, JsonVariantConst data) {
    if (!data.is<JsonObjectConst>()) {
        client->text("{\"cmd\":\"save_battery_config_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"data is not an object\"}}");
        return;
    }
    JsonObjectConst obj = data.as<JsonObjectConst>();

    if (!obj["batteryConfigText"].is<const char*>()) {
        client->text("{\"cmd\":\"save_battery_config_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"batteryConfigText missing or not string\"}}");
        return;
    }
    const char* mapText = obj["batteryConfigText"];

    File file = LittleFS.open("/battery.json", "w");
    if (!file) {
        client->text("{\"cmd\":\"save_battery_config_err\",\"data\":{\"status\":\"fs_error\"}}");
        return;
    }
    file.print(mapText);
    file.close();

    client->text("{\"cmd\":\"save_battery_config_ok\",\"data\":{\"status\":\"ok\"}}");
    // Add a short delay to ensure the WebSocket message is sent before restarting
    delay(200);
    ESP.restart();
}

static void handleSaveOutputMapping(AsyncWebSocketClient* client, JsonVariantConst data) {
    if (!data.is<JsonObjectConst>()) {
        client->text("{\"cmd\":\"save_output_mapping_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"data is not an object\"}}");
        return;
    }
    JsonObjectConst obj = data.as<JsonObjectConst>();

    if (!obj["outputMapText"].is<const char*>()) {
        client->text("{\"cmd\":\"save_output_mapping_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"outputMapText missing or not string\"}}");
        return;
    }
    const char* mapText = obj["outputMapText"];

    File file = LittleFS.open("/outputMap.json", "w");
    if (!file) {
        client->text("{\"cmd\":\"save_output_mapping_err\",\"data\":{\"status\":\"fs_error\"}}");
        return;
    }
    file.print(mapText);
    file.close();

    client->text("{\"cmd\":\"save_output_mapping_ok\",\"data\":{\"status\":\"ok\"}}");
    // Add a short delay to ensure the WebSocket message is sent before restarting
    delay(200);
    ESP.restart();
}

// --- Diagnostic Handlers ---
static void handleGetHeap(AsyncWebSocketClient* client) {
    JsonDocument doc;
    doc["cmd"] = "heap_response";
    JsonObject data = doc["data"].to<JsonObject>();
    data["heap"] = ESP.getFreeHeap();

    String output;
    serializeJson(doc, output);
    client->text(output.c_str());
}

static void handleRestartEsp(AsyncWebSocketClient* client) {
    JsonDocument doc;
    doc["cmd"] = "restart_response";
    JsonObject data = doc["data"].to<JsonObject>();
    data["status"] = "restarting";

    String output;
    serializeJson(doc, output);
    client->text(output.c_str());

    ESP.restart();
}

// --- Registration Function ---
void RegisterProjectWsCommands(WsCommandServer& ws) {
    Serial.println("Registering WS commands...");

    // High-rate binary handler
    ws.onBinary(handleBinary);

    // JSON command handlers
    ws.on("ping", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)data; (void)doc;
        client->text("{\"cmd\":\"pong\",\"data\":{\"status\":\"ok\"}}");
    });
    
    ws.on("save_input_mapping", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)doc;
        handleSaveInputMapping(client, data);
    });

    ws.on("save_battery_config", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)doc;
        handleSaveBatteryConfig(client, data);
    });

    ws.on("save_output_mapping", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)doc;
        handleSaveOutputMapping(client, data);
    });

    ws.on("get_heap", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)data; (void)doc;
        handleGetHeap(client);
    });

    ws.on("restart_esp", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)data; (void)doc;
        handleRestartEsp(client);
    });
}