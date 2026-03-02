#include <Arduino.h>
#include "networkAndWebserver/WifiAPConfig.h"
#include "networkAndWebserver/serveWebsite.h"

WiFiManagerSimple wifi;

// Build config first
StaticFileServer::Config httpCfg;

// Construct web with config AFTER httpCfg has defaults set in Config()
StaticFileServer web(httpCfg);

void setup() {
    Serial.begin(115200);

    // Start AP
    WiFiManagerSimple::APConfig ap;
    ap.ssid = "ESP32Controller";
    ap.password = "12345678";
    wifi.beginAP(ap);

    // DON'T reassign web. Configure via routes only.
    web.addPageRoute("/config/inputs",  "/config_inputs.html");
    web.addPageRoute("/config/outputs", "/config_outputs.html");

    if (!web.begin()) {
        Serial.println("Web server failed to start");
        while (true) {}
    }
}

void loop() {}