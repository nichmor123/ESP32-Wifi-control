#pragma once

#include <WiFi.h>
#include <esp_wifi.h>

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

        wifi_power_t txPower = WIFI_POWER_19_5dBm; // default max power
    };

    WiFiManagerSimple() = default;

    bool beginAP(const APConfig& cfg) {
        _apConfig = cfg;

        WiFi.mode(WIFI_AP);
        WiFi.softAPdisconnect(true);

        // Set transmit power
        esp_wifi_set_max_tx_power(powerEnumToValue(cfg.txPower));

        // Configure static AP IP
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

    // Convert Arduino enum to raw power value (0–84)
    int8_t powerEnumToValue(wifi_power_t power) {
        // ESP32 expects 0–84 where 84 ≈ 20 dBm
        switch (power) {
            case WIFI_POWER_19_5dBm: return 78;
            case WIFI_POWER_19dBm:   return 76;
            case WIFI_POWER_18_5dBm: return 74;
            case WIFI_POWER_17dBm:   return 68;
            case WIFI_POWER_15dBm:   return 60;
            case WIFI_POWER_13dBm:   return 52;
            case WIFI_POWER_11dBm:   return 44;
            case WIFI_POWER_8_5dBm:  return 34;
            case WIFI_POWER_7dBm:    return 28;
            case WIFI_POWER_5dBm:    return 20;
            case WIFI_POWER_2dBm:    return 8;
            case WIFI_POWER_MINUS_1dBm: return -4;
            default: return 78;
        }
    }
};