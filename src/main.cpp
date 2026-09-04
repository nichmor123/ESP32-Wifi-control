#include <Arduino.h>
#include <LittleFS.h>
#include <ESPmDNS.h>

#include "networkAndWebserver/WifiAPConfig.h"
#include "networkAndWebserver/StaticFileServer.h"
#include "networkAndWebserver/WsCommandServer.h"
#include "networkAndWebserver/ProjectWsCommands.h"
#include "outputs/OutputManager.h"
#include "sensors/BatteryMonitor.h"
#include "initializer/DeviceInitializer.h"

WiFiManagerSimple wifi;

StaticFileServer::Config httpCfg;
StaticFileServer web(httpCfg);

WsCommandServer ws("/ws");

OutputManager outputManager;
BatteryMonitor batteryMonitor;

// --- timing ---
static constexpr uint32_t CONTROL_DT_MS  = 10;   // 100 Hz control tick
static constexpr uint32_t RX_TIMEOUT_MS  = 300;  // failsafe if no RX for 300ms
static constexpr uint32_t PRINT_DT_MS    = 100;  // 10 Hz prints

static uint32_t lastControlMs = 0;
static uint32_t lastPrintMs   = 0;

void setup() {
    Serial.begin(921600);

        // Initialize the filesystem first so we can read configs!
    if (!LittleFS.begin(true)) {
        Serial.println("LittleFS Mount Failed");
    }
    httpCfg.mountFS = false; // Webserver doesn't need to mount it again

        // AP Configuration
    WiFiManagerSimple::APConfig ap;
    ap.ssid = "ESP32Controller";
    ap.password = "12345678";

    // Run device initializer to extract custom credentials from wifi.json (if modified)
    // or run the fleet-numbering logic (if un-modified).
    DeviceInitializer::initialize(ap.ssid, ap.password);
    
    // Check if the user specified a static IP
    File wifiFile = LittleFS.open("/wifi.json", "r");
    if (wifiFile) {
        JsonDocument wifiDoc;
        if (!deserializeJson(wifiDoc, wifiFile)) {
            const char* staticIPStr = wifiDoc["staticIP"];
            if (staticIPStr && strlen(staticIPStr) > 0) {
                ap.localIP.fromString(staticIPStr);
                ap.gateway.fromString(staticIPStr);
            }
        }
        wifiFile.close();
    }

        // Attempt to connect as a Client (STA), fallback to Access Point (AP)
    wifi.beginSTA_or_AP(ap);

    // Set up mDNS for .local hostname resolution
    File mDnsFile = LittleFS.open("/wifi.json", "r");
    String hostname = "esp32controller";
    if (mDnsFile) {
        JsonDocument wifiDoc;
        if (!deserializeJson(wifiDoc, mDnsFile)) {
            const char* savedHostname = wifiDoc["hostname"];
            if (savedHostname && strlen(savedHostname) > 0) {
                hostname = savedHostname;
            }
        }
        mDnsFile.close();
    }
    
        if (MDNS.begin(hostname.c_str())) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("mDNS responder started. Hostname: http://%s.local\n", hostname.c_str());
    } else {
        Serial.println("Error setting up mDNS responder!");
    }

    // HTTP pages
    web.addPageRoute("/", "/index.html");
    web.addPageRoute("/mobile", "/mobile.html");
    web.addPageRoute("/config/inputs",  "/config_inputs.html");
    web.addPageRoute("/battery", "/battery.html");
        web.addPageRoute("/troubleshooting", "/troubleshooting.html");
    web.addPageRoute("/config/outputs", "/config_outputs.html");
    web.addPageRoute("/settings", "/settings.html");

    //server other files
    web.server().serveStatic("/", LittleFS, "/");

    // WebSocket + commands
    RegisterProjectWsCommands(ws);
    ws.begin();
    ws.attachTo(web.server());

    if (!web.begin()) {
        Serial.println("Web server failed");
        delay(2000);
        ESP.restart();
    }

    outputManager.begin();
    batteryMonitor.begin();

    Serial.println("Setup complete");
}

void loop() {
    const uint32_t now = millis();

    // fixed-rate control tick
    if ((uint32_t)(now - lastControlMs) >= CONTROL_DT_MS) {
        lastControlMs = now;

        // Copy ONCE per tick (one lock/unlock)
        const ChannelBus bus = GetChannelBusSnapshot();

        const bool stale = (bus.lastRxMs == 0) || ((uint32_t)(now - bus.lastRxMs) > RX_TIMEOUT_MS);

        if (stale) {
            // FAILSAFE: set outputs to a safe state
            outputManager.halt();
        } else {
            // NORMAL CONTROL: update outputs from channel data
            outputManager.update(bus);
        }
    }

    // fixed-rate print tick
    if ((uint32_t)(now - lastPrintMs) >= PRINT_DT_MS) {
        lastPrintMs = now;

        // Update sensors at a slower rate
        batteryMonitor.update();
        // Send battery status only if it's enabled
        if (batteryMonitor.isEnabled()) {
            JsonDocument doc;
            doc["cmd"] = "battery_update";
            JsonObject data = doc["data"].to<JsonObject>();
            data["voltage"] = batteryMonitor.getVoltage();
            data["percentage"] = batteryMonitor.getPercentage();
            String output;
            serializeJson(doc, output);
            ws.broadcastText(output.c_str());
        }
    }

    // Nothing else needed; WiFi/Async server runs in background tasks
}