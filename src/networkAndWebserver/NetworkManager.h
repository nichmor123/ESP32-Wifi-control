#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>
#include "WifiAPConfig.h"
#include "StaticFileServer.h"
#include "WsCommandServer.h"

class StatusLedManager;

class NetworkManager {
public:
    NetworkManager();

    // Initializes WiFi connection, mDNS, routes, webserver, and WebSockets.
    bool begin(StatusLedManager* statusLed = nullptr);

    // Call periodically in loop to clean up disconnected WebSocket clients
    void update();

    WsCommandServer& getWsServer() { return _ws; }
    StaticFileServer& getWebServer() { return _webServer; }
    WiFiManagerSimple& getWiFi() { return _wifi; }

private:
    WiFiManagerSimple _wifi;
    StaticFileServer::Config _httpCfg;
    StaticFileServer _webServer;
    WsCommandServer _ws;

    void setupRoutes();
    void setupMDNS();
};
