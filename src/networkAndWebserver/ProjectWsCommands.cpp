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
    if (!data.is<JsonObjectConst>()) {
        client->text("{\"cmd\":\"save_input_mapping_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"data is not an object\"}}");
        return;
    }
    JsonObjectConst obj = data.as<JsonObjectConst>();

    if (!obj["controlMapText"].is<const char*>()) {
        client->text("{\"cmd\":\"save_input_mapping_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"controlMapText missing or not string\"}}");
        return;
    }
    const char* mapText = obj["controlMapText"];
    
    // Check if saving to a specific profile or the active profile
    const char* filename = "/controlMap.json";
    if (obj["profileName"].is<const char*>()) {
        filename = obj["profileName"];
    }

    File file = LittleFS.open(filename, "w");
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
    
    // Check if saving to a specific profile or the active profile
    const char* filename = "/outputMap.json";
    if (obj["profileName"].is<const char*>()) {
        filename = obj["profileName"];
    }

    File file = LittleFS.open(filename, "w");
    if (!file) {
        client->text("{\"cmd\":\"save_output_mapping_err\",\"data\":{\"status\":\"fs_error\"}}");
        return;
    }
    file.print(mapText);
    file.close();

    client->text("{\"cmd\":\"save_output_mapping_ok\",\"data\":{\"status\":\"ok\"}}");
    
    // Only restart if we overwrote the active output map
    if (strcmp(filename, "/outputMap.json") == 0) {
        delay(200);
        ESP.restart();
    }
}

static void handleSaveProfilesConfig(AsyncWebSocketClient* client, JsonVariantConst data) {
    if (!data.is<JsonObjectConst>()) {
        client->text("{\"cmd\":\"save_profiles_config_err\",\"data\":{\"status\":\"bad_request\"}}");
        return;
    }
    JsonObjectConst obj = data.as<JsonObjectConst>();

    if (!obj["profilesConfigText"].is<const char*>()) {
        client->text("{\"cmd\":\"save_profiles_config_err\",\"data\":{\"status\":\"bad_request\"}}");
        return;
    }
    const char* mapText = obj["profilesConfigText"];

    File file = LittleFS.open("/profiles.json", "w");
    if (!file) {
        client->text("{\"cmd\":\"save_profiles_config_err\",\"data\":{\"status\":\"fs_error\"}}");
        return;
    }
    file.print(mapText);
    file.close();

    client->text("{\"cmd\":\"save_profiles_config_ok\",\"data\":{\"status\":\"ok\"}}");
    
    // Check if we need to delete a file
    if (obj["deleteFile"].is<const char*>()) {
        const char* fileToDelete = obj["deleteFile"];
        if (LittleFS.exists(fileToDelete)) {
            LittleFS.remove(fileToDelete);
            Serial.printf("Deleted profile: %s\n", fileToDelete);
        }
    }

    // Check if we need to set active files (copy chosen profile to /controlMap.json or /outputMap.json)
    if (obj["setActiveInput"].is<const char*>()) {
        const char* sourceFile = obj["setActiveInput"];
        if (LittleFS.exists(sourceFile)) {
            File source = LittleFS.open(sourceFile, "r");
            File dest = LittleFS.open("/controlMap.json", "w");
            if (source && dest) {
                while (source.available()) {
                    dest.write(source.read());
                }
            }
            if (source) source.close();
            if (dest) dest.close();
        }
    }

    if (obj["setActiveOutput"].is<const char*>()) {
        const char* sourceFile = obj["setActiveOutput"];
        if (LittleFS.exists(sourceFile)) {
            File source = LittleFS.open(sourceFile, "r");
            File dest = LittleFS.open("/outputMap.json", "w");
            if (source && dest) {
                while (source.available()) {
                    dest.write(source.read());
                }
            }
            if (source) source.close();
            if (dest) dest.close();
        }
    }

        if (obj["restart"].is<bool>() && obj["restart"].as<bool>() == true) {
        delay(200);
        ESP.restart();
    }
}

static void handleRestoreBackup(AsyncWebSocketClient* client, JsonVariantConst data) {
    if (!data.is<JsonObjectConst>()) {
        client->text("{\"cmd\":\"restore_backup_err\",\"data\":{\"status\":\"bad_request\"}}");
        return;
    }
    JsonObjectConst obj = data.as<JsonObjectConst>();

    if (!obj["files"].is<JsonObjectConst>()) {
        client->text("{\"cmd\":\"restore_backup_err\",\"data\":{\"status\":\"missing_files_object\"}}");
        return;
    }

    JsonObjectConst filesMap = obj["files"].as<JsonObjectConst>();
    size_t restoredCount = 0;

    for (JsonPairConst kv : filesMap) {
        String filePath = kv.key().c_str();
        if (filePath.length() == 0) continue;
        if (!filePath.startsWith("/")) {
            filePath = "/" + filePath;
        }

        // Extract value as JsonVariantConst to handle both string and object/array representations
        JsonVariantConst val = kv.value();
        
        File f = LittleFS.open(filePath.c_str(), "w");
        if (f) {
            if (val.is<const char*>()) {
                f.print(val.as<const char*>());
            } else {
                serializeJson(val, f);
            }
            f.close();
            restoredCount++;
            Serial.printf("Restored file: %s (bytes written)\n", filePath.c_str());
        } else {
            Serial.printf("Failed to open file for restore: %s\n", filePath.c_str());
        }
    }

    JsonDocument respDoc;
    respDoc["cmd"] = "restore_backup_ok";
    JsonObject respData = respDoc["data"].to<JsonObject>();
    respData["status"] = "ok";
    respData["restoredCount"] = restoredCount;
    String respStr;
    serializeJson(respDoc, respStr);
    client->text(respStr.c_str());

    if (obj["restart"].is<bool>() && obj["restart"].as<bool>() == true) {
        delay(300);
        ESP.restart();
    }
}
    static void handleSaveWifiConfig(AsyncWebSocketClient* client, JsonVariantConst data) {
    if (!data.is<JsonObjectConst>()) {
        client->text("{\"cmd\":\"save_wifi_config_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"data is not an object\"}}");
        return;
    }
    JsonObjectConst obj = data.as<JsonObjectConst>();

    if (!obj["wifiConfigText"].is<const char*>()) {
        client->text("{\"cmd\":\"save_wifi_config_err\",\"data\":{\"status\":\"bad_request\",\"reason\":\"wifiConfigText missing or not string\"}}");
        return;
    }
    
    // Set the modified flag to 1 so the device knows it has been configured
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, obj["wifiConfigText"]);
    if (!error) {
        doc["modified"] = 1;
        
        File file = LittleFS.open("/wifi.json", "w");
        if (!file) {
            client->text("{\"cmd\":\"save_wifi_config_err\",\"data\":{\"status\":\"fs_error\"}}");
            return;
        }
        serializeJson(doc, file);
        file.close();

        client->text("{\"cmd\":\"save_wifi_config_ok\",\"data\":{\"status\":\"ok\"}}");
        // Add a short delay to ensure the WebSocket message is sent before restarting
        delay(200);
        ESP.restart();
    } else {
         client->text("{\"cmd\":\"save_wifi_config_err\",\"data\":{\"status\":\"json_error\"}}");
    }
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

        ws.on("save_wifi_config", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)doc;
        handleSaveWifiConfig(client, data);
    });

        ws.on("save_profiles_config", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)doc;
        handleSaveProfilesConfig(client, data);
    });

    ws.on("restore_backup", [](AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc) {
        (void)doc;
        handleRestoreBackup(client, data);
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