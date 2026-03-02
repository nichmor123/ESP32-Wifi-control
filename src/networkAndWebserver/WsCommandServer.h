#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

class WsCommandServer {
public:
    using Handler = void (*)(AsyncWebSocketClient* client,
                             JsonVariantConst data,
                             JsonDocument& rawDoc);

    explicit WsCommandServer(const char* wsPath = "/ws");

    // Non-copyable (important)
    WsCommandServer(const WsCommandServer&) = delete;
    WsCommandServer& operator=(const WsCommandServer&) = delete;

    // Attach to an existing AsyncWebServer (from your StaticFileServer)
    void attachTo(AsyncWebServer& server);

    // Register a command handler: {"cmd":"name","data":...}
    bool on(const char* cmd, Handler handler);

    // Start handling events (call once after handlers are registered)
    void begin();

    // Convenience send
    void sendText(AsyncWebSocketClient* client, const char* text);
    void broadcastText(const char* text);

private:
    struct Entry {
        const char* cmd;
        Handler handler;
    };

    static constexpr size_t MAX_COMMANDS = 32;

    AsyncWebSocket _ws;
    Entry _entries[MAX_COMMANDS]{};
    size_t _count = 0;

    Handler findHandler(const char* cmd) const;

    void handleEvent(AsyncWebSocket* server,
                     AsyncWebSocketClient* client,
                     AwsEventType type,
                     void* arg,
                     uint8_t* data,
                     size_t len);

    void handleTextMessage(AsyncWebSocketClient* client,
                           const uint8_t* data,
                           size_t len);
};