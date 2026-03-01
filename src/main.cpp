#include <Arduino.h>
#include <LittleFS.h>
#include <networkAndWebserver/startWifiAP.h>

WiFiManagerSimple wifi;
int myFunction(int, int);

void setup() {
  WiFiManagerSimple::APConfig cfg;
  cfg.ssid = "ESP32Controller";
  cfg.password = "12345678";
  cfg.channel = 6;
  wifi.beginAP(cfg);
}

void loop() {
  
}

// put function definitions here:
int myFunction(int x, int y) {
  return x + y;
}