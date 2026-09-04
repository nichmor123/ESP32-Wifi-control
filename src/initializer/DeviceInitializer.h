#pragma once

#include <Arduino.h>

class DeviceInitializer {
public:
    // This starts the scanning and LED tasks if the device has not been customized.
    // It returns true if it determined it is the first boot (modified == 0) and handled the AP SSID suffix.
    // Call this before wifi.beginAP().
    static void initialize(String& ssidToModify, String& passwordToModify);
};
