#include <Arduino.h>
#include "networkAndWebserver/WifiAPConfig.h"
#include "networkAndWebserver/serveWebsite.h"

WiFiManagerSimple wifi;

StaticFileServer::Config httpCfg;
StaticFileServer web(httpCfg);

void setup() {
    Serial.begin(115200);

    // Start AP
    WiFiManagerSimple::APConfig ap;
    ap.ssid = "UniversalController";
    ap.password = "robotics123";
    wifi.beginAP(ap);

    httpCfg.defaultFile = "/index.html";
    web = StaticFileServer(httpCfg);
    web.addPageRoute("/config/inputs",  "/config_inputs.html");
    web.addPageRoute("/config/outputs", "/config_outputs.html");
    web.begin();
}

void loop() {

}