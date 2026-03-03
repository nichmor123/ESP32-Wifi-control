#include "WsCommandServer.h"
#include <Arduino.h>
#include <ArduinoJson.h>

WsCommandServer::WsCommandServer(const char* wsPath)
    : _ws(wsPath) {}

void WsCommandServer::attachTo(AsyncWebServer& server) {
    server.addHandler(&_ws);
}

bool WsCommandServer::on(const char* cmd, Handler handler) {
    if (!cmd || !handler) return false;

    // Replace if exists
    for (size_t i = 0; i < _count; i++) {
        if (strcmp(_entries[i].cmd, cmd) == 0) {
            _entries[i].handler = handler;
            Serial.printf("WS cmd updated: %s (count=%u)\n", cmd, (unsigned)_count);
            return true;
        }
    }

    if (_count >= MAX_COMMANDS) {
        Serial.println("WS cmd register failed: MAX_COMMANDS reached");
        return false;
    }

    _entries[_count++] = Entry{cmd, handler};
    Serial.printf("WS cmd registered: %s (count=%u)\n", cmd, (unsigned)_count);
    return true;
}

void WsCommandServer::begin() {
    _ws.onEvent([this](AsyncWebSocket* server,
                       AsyncWebSocketClient* client,
                       AwsEventType type,
                       void* arg,
                       uint8_t* data,
                       size_t len) {
        this->handleEvent(server, client, type, arg, data, len);
    });
}

void WsCommandServer::sendText(AsyncWebSocketClient* client, const char* text) {
    if (!client || !text) return;
    client->text(text);
}

void WsCommandServer::broadcastText(const char* text) {
    if (!text) return;
    _ws.textAll(text);
}

WsCommandServer::Handler WsCommandServer::findHandler(const char* cmd) const {
    if (!cmd) return nullptr;
    for (size_t i = 0; i < _count; i++) {
        if (strcmp(_entries[i].cmd, cmd) == 0) return _entries[i].handler;
    }
    return nullptr;
}

void WsCommandServer::handleEvent(AsyncWebSocket*,
                                  AsyncWebSocketClient* client,
                                  AwsEventType type,
                                  void* arg,
                                  uint8_t* data,
                                  size_t len) {
    switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("WS client connected: id=%u\n", client ? client->id() : 0);
            break;

        case WS_EVT_DISCONNECT:
            Serial.printf("WS client disconnected: id=%u\n", client ? client->id() : 0);
            break;

        case WS_EVT_DATA: {
            auto* info = reinterpret_cast<AwsFrameInfo*>(arg);
            if (!info || !client) return;

            if (info->opcode != WS_TEXT) return;

            // Keep it simple: require one complete frame
            if (!info->final || info->index != 0) {
                client->text("{\"err\":\"fragmented_frame_not_supported\"}");
                return;
            }

            handleTextMessage(client, data, len);
            break;
        }

        default:
            break;
    }
}

void WsCommandServer::handleTextMessage(AsyncWebSocketClient* client,
                                        const uint8_t* data,
                                        size_t len) {
    if (!client || !data || len == 0) return;

    // Debug print raw payload (truncate to avoid spamming serial)
    const size_t kMaxPrint = 300;
    Serial.print("WS raw: ");
    for (size_t i = 0; i < len && i < kMaxPrint; i++) Serial.print((char)data[i]);
    if (len > kMaxPrint) Serial.print("...<truncated>");
    Serial.println();

    // IMPORTANT:
    // - Parse directly from the buffer WITH LENGTH.
    // - Don't build a String.
    //
    // Size guidance:
    // - ping/set_inputs: small (<1 KB)
    // - save_input_mapping with controlMapText: still small wrapper, BUT the string field
    //   increases required capacity somewhat.
    // Start with 8 KB; bump if you add more big commands.
    StaticJsonDocument<8192> doc;

    DeserializationError err = deserializeJson(doc, (const char*)data, len);
    if (err) {
        Serial.printf("WS bad_json: %s\n", err.c_str());
        client->text("{\"err\":\"bad_json\"}");
        return;
    }

    const char* cmd = doc["cmd"].as<const char*>();
    Serial.printf("WS RX cmd='%s' registered=%u\n", cmd ? cmd : "NULL", (unsigned)_count);

    Handler h = findHandler(cmd);
    if (!h) {
        client->text("{\"err\":\"unknown_cmd\"}");
        return;
    }

    JsonVariantConst payload = doc["data"];
    h(client, payload, doc);
}