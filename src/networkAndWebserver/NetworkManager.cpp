#include "NetworkManager.h"
#include "ProjectWsCommands.h"
#include "initializer/DeviceInitializer.h"
#include "led/StatusLedManager.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <ESPmDNS.h>

NetworkManager::NetworkManager()
    : _httpCfg(), _webServer(_httpCfg), _ws("/ws") {
    _httpCfg.mountFS = false; // FS initialized in setup/main before calling NetworkManager::begin
}

bool NetworkManager::begin(StatusLedManager* statusLed) {
    // AP / Network default config
    WiFiManagerSimple::APConfig ap;
    ap.ssid = "ESP32Controller";
    ap.password = "12345678";

    // Run device initializer for fleet auto-numbering
    DeviceInitializer::initialize(ap.ssid, ap.password, statusLed);

    // Read wifi.json for static IP if configured
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
    _wifi.beginSTA_or_AP(ap);

    // Setup mDNS responder
    setupMDNS();

    // Setup HTTP pages & static file serving
    setupRoutes();

    // WebSocket + project command handlers
    RegisterProjectWsCommands(_ws);
    _ws.begin();
    _ws.attachTo(_webServer.server());

    // Start HTTP server
    if (!_webServer.begin()) {
        Serial.println("Web server failed to start");
        return false;
    }

    return true;
}

void NetworkManager::setupMDNS() {
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
}

void NetworkManager::setupRoutes() {
    _webServer.addPageRoute("/", "/index.html");
    _webServer.addPageRoute("/computer", "/computer.html");
    _webServer.addPageRoute("/mobile", "/mobile.html");
    _webServer.addPageRoute("/inputs",  "/inputs.html");
    _webServer.addPageRoute("/mixes", "/mixes.html");
    _webServer.addPageRoute("/outputs", "/outputs.html");
    _webServer.addPageRoute("/battery", "/battery.html");
    _webServer.addPageRoute("/backup", "/backup.html");
    _webServer.addPageRoute("/troubleshooting", "/troubleshooting.html");
    _webServer.addPageRoute("/settings", "/settings.html");

    // Serve static files from LittleFS root
    _webServer.server().serveStatic("/", LittleFS, "/");
}

void NetworkManager::update() {
    _ws.cleanupClients();
}
