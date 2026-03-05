#include "WsCommandServer.h"
#include <Arduino.h>
#include <ArduinoJson.h>

// Simple per-client buffering.
// Good enough for your project: one outstanding message per client.
struct WsRxBuffer {
    uint32_t clientId = 0;
    size_t expectedLen = 0;
    size_t filled = 0;
    String buf;
    bool active = false;

    void reset(uint32_t id, size_t len) {
        clientId = id;
        expectedLen = len;
        filled = 0;
        buf = "";
        buf.reserve(len + 1);
        active = true;
    }

    void clear() {
        clientId = 0;
        expectedLen = 0;
        filled = 0;
        buf = "";
        active = false;
    }
};

static WsRxBuffer g_rx;

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
            // If the disconnected client was buffering, clear it
            if (client && g_rx.active && g_rx.clientId == client->id()) {
                g_rx.clear();
            }
            break;

        case WS_EVT_DATA: {
            auto* info = reinterpret_cast<AwsFrameInfo*>(arg);
            if (!info || !client) return;

            // ---- NEW: Binary control packets ----
            if (info->opcode == WS_BINARY) {
                // Control packets are small; require one complete frame
                if (!info->final || info->index != 0) {
                    client->text("{\"err\":\"bin_fragment_not_supported\"}");
                    return;
                }
                if (_binHandler) _binHandler(client, data, len);
                return;
            }

            // ---- Text JSON commands ----
            if (info->opcode != WS_TEXT) return;

            // info->len is TOTAL message length (bytes) for this frame sequence
            // info->index is offset into the message
            // len is the current chunk length

            // Start of a new message
            if (info->index == 0) {
                // If we were mid-message for this client, drop it
                if (g_rx.active && g_rx.clientId == client->id()) {
                    Serial.println("WS: dropping previous incomplete message");
                    g_rx.clear();
                }
                g_rx.reset(client->id(), info->len);

                // Basic sanity limit (tune as you like)
                if (g_rx.expectedLen > 20000) {
                    Serial.printf("WS: message too large (%u bytes)\n", (unsigned)g_rx.expectedLen);
                    g_rx.clear();
                    client->text("{\"err\":\"msg_too_large\"}");
                    return;
                }
            }

            // If we aren't buffering for this client, ignore
            if (!g_rx.active || g_rx.clientId != client->id()) {
                Serial.println("WS: chunk for unexpected client (ignored)");
                return;
            }

            // Append this chunk
            for (size_t i = 0; i < len; i++) g_rx.buf += (char)data[i];
            g_rx.filled = info->index + len;

            // Done?
            if (info->final && g_rx.filled >= g_rx.expectedLen) {
                this->handleTextMessage(client, (const uint8_t*)g_rx.buf.c_str(), g_rx.buf.length());
                g_rx.clear();
            }

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

    // Print a small prefix
    const size_t kMaxPrint = 220;
    Serial.print("WS raw: ");
    for (size_t i = 0; i < len && i < kMaxPrint; i++) Serial.print((char)data[i]);
    if (len > kMaxPrint) Serial.print("...<truncated>");
    Serial.println();

    // Parse full message now
    StaticJsonDocument<12288> doc;

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