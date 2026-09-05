#include "BatteryMonitor.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

BatteryMonitor::BatteryMonitor() {}

void BatteryMonitor::begin() {
    File file = LittleFS.open("/config/battery.json");
    if (!file) {
        Serial.println("No battery.json found, monitoring disabled.");
        return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.println("Failed to parse battery.json, monitoring disabled.");
        return;
    }

    _config.enabled = doc["enabled"] | false;
    if (!_config.enabled) {
        Serial.println("Battery monitoring is disabled in config.");
        return;
    }

    _config.pin = doc["pin"];
    _config.r1 = doc["r1"];
    _config.r2 = doc["r2"];
    _config.vRef = doc["vRef"];
    _config.adcResolution = doc["adcResolution"];

    const char* chem = doc["chemistry"];
    int cells = doc["cells"];

    if (strcmp(chem, "lipo") == 0) {
        _config.vMax = cells * 4.2f;
        _config.vMin = cells * 3.0f;
    } else if (strcmp(chem, "lifepo4") == 0) {
        _config.vMax = cells * 3.65f;
        _config.vMin = cells * 2.5f;
    }

    pinMode(_config.pin, INPUT);

        // Prime the moving average filter with initial readings
    for (int i = 0; i < NUM_READINGS; ++i) {
        _readings[i] = analogReadMilliVolts(_config.pin) / 1000.0f; // Use calibrated millivolts
        delay(2); // Small delay between readings
    }

    Serial.printf("Battery monitor enabled on pin %d\n", _config.pin);
}

void BatteryMonitor::update() {
    if (!_config.enabled) return;

    // --- Moving Average Filter ---
    // Read from the sensor in calibrated Volts and update the readings array
    _readings[_readingIndex] = analogReadMilliVolts(_config.pin) / 1000.0f;
    _readingIndex = (_readingIndex + 1) % NUM_READINGS;

    // Calculate the average
    float total = 0;
    for(int i=0; i<NUM_READINGS; ++i) total += _readings[i];

    float v_out = total / NUM_READINGS; // v_out is now the average voltage in Volts
    _voltage = v_out * (_config.r1 + _config.r2) / _config.r2;
}

float BatteryMonitor::getPercentage() const {
    if (!_config.enabled || _voltage <= 0) {
        return 0.0f;
    }

    float percentage = ((_voltage - _config.vMin) / (_config.vMax - _config.vMin)) * 100.0f;

    // Clamp the value between 0 and 100
    if (percentage > 100.0f) {
        return 100.0f;
    }
    if (percentage < 0.0f) {
        return 0.0f;
    }
    return percentage;
}