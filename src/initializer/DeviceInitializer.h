#pragma once

#include <Arduino.h>

class StatusLedManager;

class DeviceInitializer {
public:
    // Scans network and handles auto-numbering.
    // Accepts a reference to StatusLedManager to set the flash pattern if unmodified.
    // Returns the assigned auto-number if fresh/unmodified, or 0 if customized.
    static int initialize(String& ssidToModify, String& passwordToModify, StatusLedManager* statusLed = nullptr);
};
