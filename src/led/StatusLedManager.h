#pragma once

#include <Arduino.h>
#include "LedHandler.h"

class StatusLedManager {
public:
    enum class State {
        AUTO_NUMBERING,
        WIFI_NO_DEVICES,
        DEVICE_CONNECTED,
        ACTIVE_CONTROL
    };

    explicit StatusLedManager(uint8_t pin = 2, bool activeHigh = true);

    void begin();
    
    // Set auto numbering mode with the assigned board number
    void setAutoNumbering(int autoNumber);

    // Default WiFi running without client connections state
    void setWifiNoDevices();

    // Call inside main loop() to handle state machine transitions and update the LED hardware
    void update(bool isRxActive, size_t wsClientCount);

    // Access underlying universal LedHandler
    LedHandler* getLedHandler() { return &_ledHandler; }
    State getState() const { return _currentState; }

private:
    LedHandler _ledHandler;
    State _currentState = State::WIFI_NO_DEVICES;

    void applyStatePattern(State newState);
};
