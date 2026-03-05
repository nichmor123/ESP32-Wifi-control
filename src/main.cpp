#include <Arduino.h>

#include "networkAndWebserver/WifiAPConfig.h"
#include "networkAndWebserver/StaticFileServer.h"
#include "networkAndWebserver/WsCommandServer.h"
#include "networkAndWebserver/ProjectWsCommands.h"

WiFiManagerSimple wifi;

StaticFileServer::Config httpCfg;
StaticFileServer web(httpCfg);

WsCommandServer ws("/ws");

// --- timing ---
static constexpr uint32_t CONTROL_DT_MS  = 10;   // 100 Hz control tick
static constexpr uint32_t RX_TIMEOUT_MS  = 300;  // failsafe if no RX for 300ms
static constexpr uint32_t PRINT_DT_MS    = 100;  // 10 Hz prints

static uint32_t lastControlMs = 0;
static uint32_t lastPrintMs   = 0;

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

    // ----- fixed-rate control tick -----
    if ((uint32_t)(now - lastControlMs) >= CONTROL_DT_MS) {
        lastControlMs = now;

        // Copy ONCE per tick (one lock/unlock)
        const ChannelBus bus = GetChannelBusSnapshot();

        const bool stale = (bus.lastRxMs == 0) || ((uint32_t)(now - bus.lastRxMs) > RX_TIMEOUT_MS);

        if (stale) {
            // FAILSAFE: stop outputs here (when you add outputs)
            // Example:
            // setDrive(0,0);
        } else {
            // NORMAL CONTROL:
            const float c1 = bus.ch[0]; // C1

            // Example placeholder for future output logic:
            // driveFromChannel(c1);
            (void)c1;
        }

        // ----- debug print decoupled from control tick -----
        if ((uint32_t)(now - lastPrintMs) >= PRINT_DT_MS) {
            lastPrintMs = now;

            // Use the SAME snapshot we already copied this tick.
            // (No extra GetChannelBusSnapshot() call.)
            const float c1 = bus.ch[0];

            Serial.print("C1=");
            Serial.print(c1, 3);
            Serial.print("  lastRxMs=");
            Serial.print(bus.lastRxMs);
            Serial.print("  stale=");
            Serial.println(stale ? "YES" : "NO");
        }
    }

    // Nothing else needed; WiFi/Async server runs in background tasks
}