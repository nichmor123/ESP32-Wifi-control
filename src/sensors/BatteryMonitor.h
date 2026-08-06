#pragma once

#include <Arduino.h>

class BatteryMonitor {
public:
    BatteryMonitor();
    void begin();
    void update();

    float getVoltage() const { return _voltage; }
    float getPercentage() const;
    bool isEnabled() const { return _config.enabled; }

private:
    struct Config {
        bool enabled = false;
        uint8_t pin = 0;
        float r1 = 33000.0f;
        float r2 = 10000.0f;
        float vRef = 3.3f;
        uint16_t adcResolution = 4095;
        float vMax = 12.6f; // 3S LiPo default
        float vMin = 9.0f;  // 3S LiPo default
    };

    Config _config;
    float _voltage = 0.0f;

    // For moving average filter
    static constexpr int NUM_READINGS = 10;
    float _readings[NUM_READINGS] = {0};
    int _readingIndex = 0;
};