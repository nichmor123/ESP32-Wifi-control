#include <Arduino.h>
#include <ESP32Servo.h>

#include "networkAndWebserver/WifiAPConfig.h"
#include "networkAndWebserver/StaticFileServer.h"
#include "networkAndWebserver/WsCommandServer.h"
#include "networkAndWebserver/ProjectWsCommands.h"
#include "motorstuff.h"

#define L_ESC 26
#define R_ESC 25


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
    ap.ssid = "Toasty";
    ap.password = "auvsiauvsi";
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
    
    // ⚡ Attach ESC pins and send neutral signal
    setUpPinModes(L_ESC, 0, R_ESC, 0, 0, 0);

    delay(2000); // allow ESC to arm

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

        driveMotor(0, 1, bus.ch[0]*100);
        driveMotor(2, 3, bus.ch[1]*100);
        
    }

    // Nothing else needed; WiFi/Async server runs in background tasks
}