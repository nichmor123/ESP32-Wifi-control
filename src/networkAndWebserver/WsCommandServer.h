#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <stddef.h>
#include <stdint.h>

class WsCommandServer {
public:
    using Handler = void (*)(AsyncWebSocketClient* client, JsonVariantConst data, JsonDocument& doc);

    // NEW: binary handler for high-rate control packets
    using BinaryHandler = void (*)(AsyncWebSocketClient* client, const uint8_t* data, size_t len);

    explicit WsCommandServer(const char* wsPath);

    void attachTo(AsyncWebServer& server);
    void begin();

    bool on(const char* cmd, Handler handler);

    // NEW
    void onBinary(BinaryHandler handler) { _binHandler = handler; }

    void sendText(AsyncWebSocketClient* client, const char* text);
    void broadcastText(const char* text);

private:
    static constexpr size_t MAX_COMMANDS = 24;

    struct Entry {
        const char* cmd;
        Handler handler;
    };

    AsyncWebSocket _ws;
    Entry _entries[MAX_COMMANDS]{};
    size_t _count = 0;

    // NEW
    BinaryHandler _binHandler = nullptr;

    Handler findHandler(const char* cmd) const;

    void handleEvent(AsyncWebSocket* server,
                     AsyncWebSocketClient* client,
                     AwsEventType type,
                     void* arg,
                     uint8_t* data,
                     size_t len);

    void handleTextMessage(AsyncWebSocketClient* client, const uint8_t* data, size_t len);
};