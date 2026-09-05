#include "StatusLedManager.h"

// Define custom timing patterns
static constexpr uint32_t PATTERN_WIFI_NO_DEVICES[] = {1200, 300, 1200, 2000};
static constexpr uint32_t PATTERN_ACTIVE_CONTROL[] = {80, 80, 80, 600};

StatusLedManager::StatusLedManager(uint8_t pin, bool activeHigh)
    : _ledHandler(pin, activeHigh) {}

void StatusLedManager::begin() {
    _ledHandler.begin();
    applyStatePattern(_currentState);
}

void StatusLedManager::setAutoNumbering(int autoNumber) {
    if (autoNumber > 0) {
        _currentState = State::AUTO_NUMBERING;
        _ledHandler.setCountPattern(autoNumber, 200, 300, 1500, 3000);
    } else {
        setWifiNoDevices();
    }
}

void StatusLedManager::setWifiNoDevices() {
    applyStatePattern(State::WIFI_NO_DEVICES);
}

void StatusLedManager::applyStatePattern(State newState) {
    _currentState = newState;
    switch (_currentState) {
        case State::AUTO_NUMBERING:
            // Auto numbering pattern set via setAutoNumbering()
            break;
        case State::WIFI_NO_DEVICES:
            _ledHandler.setCustomPattern(PATTERN_WIFI_NO_DEVICES, 4);
            break;
        case State::DEVICE_CONNECTED:
            _ledHandler.setBlink(500, 500);
            break;
        case State::ACTIVE_CONTROL:
            _ledHandler.setCustomPattern(PATTERN_ACTIVE_CONTROL, 4);
            break;
    }
}

void StatusLedManager::update(bool isRxActive, size_t wsClientCount) {
    // Determine state transition if not in auto-numbering mode
    if (_currentState != State::AUTO_NUMBERING) {
        State targetState;
        if (isRxActive) {
            targetState = State::ACTIVE_CONTROL;
        } else if (wsClientCount > 0) {
            targetState = State::DEVICE_CONNECTED;
        } else {
            targetState = State::WIFI_NO_DEVICES;
        }

        if (targetState != _currentState) {
            applyStatePattern(targetState);
        }
    }

    _ledHandler.update();
}
