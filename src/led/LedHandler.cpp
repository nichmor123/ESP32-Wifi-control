#include "LedHandler.h"

LedHandler::LedHandler(uint8_t pin, bool activeHigh)
    : _pin(pin), _activeHigh(activeHigh) {}

LedHandler::~LedHandler() {
    stopBackgroundTask();
}

void LedHandler::begin() {
    pinMode(_pin, OUTPUT);
    writePin(false);
}

void LedHandler::writePin(bool state) {
    _state = state;
    digitalWrite(_pin, _activeHigh ? (state ? HIGH : LOW) : (state ? LOW : HIGH));
}

void LedHandler::setOff() {
    _currentMode = Mode::OFF;
    _stepIndex = 0;
    _lastStepMs = millis();
    writePin(false);
}

void LedHandler::setOn() {
    _currentMode = Mode::ON;
    _stepIndex = 0;
    _lastStepMs = millis();
    writePin(true);
}

void LedHandler::setBlink(uint32_t onMs, uint32_t offMs) {
    _blinkCfg.onMs = onMs;
    _blinkCfg.offMs = offMs;
    _currentMode = Mode::BLINK;
    _stepIndex = 0;
    _lastStepMs = millis();
    writePin(true);
}

void LedHandler::setCountPattern(uint8_t count, uint32_t onMs, uint32_t offMs, uint32_t pauseMs, uint32_t longPauseMs) {
    if (count == 0) {
        setOff();
        return;
    }
    _countCfg.count = count;
    _countCfg.onMs = onMs;
    _countCfg.offMs = offMs;
    _countCfg.pauseMs = pauseMs;
    _countCfg.longPauseMs = longPauseMs;

    _currentMode = Mode::COUNT_PATTERN;
    _stepIndex = 0;
    _lastStepMs = millis();
    writePin(true);
}

void LedHandler::setCustomPattern(const uint32_t* durationsMs, uint8_t length) {
    if (!durationsMs || length == 0) {
        setOff();
        return;
    }
    _customCfg.durationsMs = durationsMs;
    _customCfg.length = length;

    _currentMode = Mode::CUSTOM_PATTERN;
    _stepIndex = 0;
    _lastStepMs = millis();
    writePin(true);
}

void LedHandler::update() {
    const uint32_t now = millis();

    switch (_currentMode) {
        case Mode::OFF:
            if (_state) writePin(false);
            break;

        case Mode::ON:
            if (!_state) writePin(true);
            break;

        case Mode::BLINK: {
            uint32_t targetMs = (_stepIndex % 2 == 0) ? _blinkCfg.onMs : _blinkCfg.offMs;
            if ((uint32_t)(now - _lastStepMs) >= targetMs) {
                _lastStepMs = now;
                _stepIndex = (_stepIndex + 1) % 2;
                writePin(_stepIndex % 2 == 0);
            }
            break;
        }

        case Mode::COUNT_PATTERN: {
            const uint8_t count = _countCfg.count;
            const uint8_t totalSteps = 4 * count + 2;

            uint32_t durationMs = 0;
            bool nextState = false;

            if (_stepIndex < 2 * count) {
                if (_stepIndex % 2 == 0) {
                    nextState = true;
                    durationMs = _countCfg.onMs;
                } else {
                    nextState = false;
                    durationMs = _countCfg.offMs;
                }
            } else if (_stepIndex == 2 * count) {
                nextState = false;
                durationMs = _countCfg.pauseMs;
            } else if (_stepIndex < 4 * count + 1) {
                uint8_t rel = _stepIndex - (2 * count + 1);
                if (rel % 2 == 0) {
                    nextState = true;
                    durationMs = _countCfg.onMs;
                } else {
                    nextState = false;
                    durationMs = _countCfg.offMs;
                }
            } else {
                nextState = false;
                durationMs = _countCfg.longPauseMs;
            }

            if (_state != nextState) {
                writePin(nextState);
            }

            if ((uint32_t)(now - _lastStepMs) >= durationMs) {
                _lastStepMs = now;
                _stepIndex = (_stepIndex + 1) % totalSteps;
            }
            break;
        }

        case Mode::CUSTOM_PATTERN: {
            if (!_customCfg.durationsMs || _customCfg.length == 0) break;

            uint32_t durationMs = _customCfg.durationsMs[_stepIndex];
            bool nextState = (_stepIndex % 2 == 0); // Even steps = ON, Odd steps = OFF

            if (_state != nextState) {
                writePin(nextState);
            }

            if ((uint32_t)(now - _lastStepMs) >= durationMs) {
                _lastStepMs = now;
                _stepIndex = (_stepIndex + 1) % _customCfg.length;
            }
            break;
        }
    }
}

void LedHandler::freertosTask(void* pvParameters) {
    LedHandler* handler = static_cast<LedHandler*>(pvParameters);
    while (true) {
        if (handler) {
            handler->update();
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void LedHandler::startBackgroundTask(uint32_t stackSize, UBaseType_t priority) {
    if (_taskHandle == nullptr) {
        xTaskCreate(freertosTask, "LedTask", stackSize, this, priority, &_taskHandle);
    }
}

void LedHandler::stopBackgroundTask() {
    if (_taskHandle != nullptr) {
        vTaskDelete(_taskHandle);
        _taskHandle = nullptr;
    }
    writePin(false);
}
