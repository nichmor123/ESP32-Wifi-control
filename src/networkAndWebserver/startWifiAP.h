#pragma once

#include <WiFi.h>

class WiFiManagerSimple {
public:
    struct APConfig {
        String ssid        = "ESP32-Controller";
        String password    = "controller123";  // must be >= 8 chars
        uint8_t channel    = 6;
        bool hidden        = false;
        uint8_t maxClients = 4;

        IPAddress localIP  = IPAddress(192,168,4,1);
        IPAddress gateway  = IPAddress(192,168,4,1);
        IPAddress subnet   = IPAddress(255,255,255,0);
    };

    WiFiManagerSimple() = default;

    bool beginAP(const APConfig& cfg) {
        _apConfig = cfg;

        WiFi.mode(WIFI_AP);
        WiFi.softAPdisconnect(true);

        // Set static AP IP
        if (!WiFi.softAPConfig(cfg.localIP, cfg.gateway, cfg.subnet)) {
            Serial.println("Failed to configure AP IP");
            return false;
        }

        bool ok = WiFi.softAP(
            cfg.ssid.c_str(),
            cfg.password.length() >= 8 ? cfg.password.c_str() : nullptr,
            cfg.channel,
            cfg.hidden,
            cfg.maxClients
        );

        if (!ok) {
            Serial.println("Failed to start AP");
            return false;
        }

        Serial.println("AP started");
        Serial.print("SSID: ");
        Serial.println(cfg.ssid);
        Serial.print("IP: ");
        Serial.println(WiFi.softAPIP());

        return true;
    }

    void stopAP() {
        WiFi.softAPdisconnect(true);
    }

    IPAddress ip() const {
        return WiFi.softAPIP();
    }

    uint8_t connectedClients() const {
        return WiFi.softAPgetStationNum();
    }

private:
    APConfig _apConfig;
};