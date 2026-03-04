#include <Arduino.h>

#include "networkAndWebserver/WifiAPConfig.h"
#include "networkAndWebserver/StaticFileServer.h"
#include "networkAndWebserver/WsCommandServer.h"
#include "networkAndWebserver/ProjectWsCommands.h"

WiFiManagerSimple wifi;

StaticFileServer::Config httpCfg;
StaticFileServer web(httpCfg);

WsCommandServer ws("/ws");

static uint32_t lastPrintMs = 0;

void setup() {
    Serial.begin(921600);

    // AP
    WiFiManagerSimple::APConfig ap;
    ap.ssid = "ESP32Controller";
    ap.password = "12345678";
    wifi.beginAP(ap);

    // HTTP pages
    web.addPageRoute("/config/inputs",  "/config_inputs.html");
    web.addPageRoute("/config/outputs", "/config_outputs.html");

    // WebSocket + commands
    RegisterProjectWsCommands(ws);
    ws.begin();
    ws.attachTo(web.server());

    if (!web.begin()) {
        Serial.println("Web server failed");
        delay(2000);
        ESP.restart();
    }

    Serial.println("Setup complete");
}

void loop() {
    const uint32_t now = millis();

    // Print at 10 Hz
    if (now - lastPrintMs >= 100) {
        lastPrintMs = now;

        ChannelBus bus = GetChannelBusSnapshot();

        // Example: print C1 (channel index 0)
        float c1 = bus.ch[0];

        // Basic failsafe: if no update in last 300ms, treat as stale
        bool stale = (bus.lastRxMs == 0) || (now - bus.lastRxMs > 300);

        Serial.print("C1=");
        Serial.print(c1, 3);
        Serial.print("  lastRxMs=");
        Serial.print(bus.lastRxMs);
        Serial.print("  stale=");
        Serial.println(stale ? "YES" : "NO");
    }
}