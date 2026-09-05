#pragma once

#include <Arduino.h>
#include <stdint.h>

/**
 * Universal LedHandler
 * Reusable, non-blocking / background task LED controller for Arduino/ESP32.
 * 
 * Modes supported:
 *  - OFF: Constant low/off
 *  - ON: Constant high/on
 *  - BLINK: Simple periodic blink (onTimeMs / offTimeMs)
 *  - COUNT_PATTERN: Flashes N times (onTimeMs / offTimeMs), pauses (pauseMs), flashes N times, long pauses (longPauseMs)
 *  - CUSTOM_PATTERN: Array of on/off pulse durations (ms) played in a loop
 */
class LedHandler {
public:
    enum class Mode {
        OFF,
        ON,
        BLINK,
        COUNT_PATTERN,
        CUSTOM_PATTERN
    };

    // Configuration for Mode::BLINK
    struct BlinkConfig {
        uint32_t onMs = 200;
        uint32_t offMs = 200;
    };

    // Configuration for Mode::COUNT_PATTERN (e.g. flash count N twice with pauses)
    struct CountPatternConfig {
        uint8_t count = 1;
        uint32_t onMs = 200;
        uint32_t offMs = 300;
        uint32_t pauseMs = 1500;
        uint32_t longPauseMs = 3000;
    };

    // Configuration for Mode::CUSTOM_PATTERN
    struct CustomPatternConfig {
        const uint32_t* durationsMs = nullptr; // Array of durations in ms [on, off, on, off, ...]
        uint8_t length = 0;                     // Total steps in array (must be even or handled appropriately)
    };

    explicit LedHandler(uint8_t pin = 2, bool activeHigh = true);
    ~LedHandler();

    void begin();
    
    // Mode control
    void setOff();
    void setOn();
    void setBlink(uint32_t onMs, uint32_t offMs);
    void setCountPattern(uint8_t count, uint32_t onMs = 200, uint32_t offMs = 300, uint32_t pauseMs = 1500, uint32_t longPauseMs = 3000);
    void setCustomPattern(const uint32_t* durationsMs, uint8_t length);

    // Get current mode
    Mode getMode() const { return _currentMode; }

    // Call periodically in loop if not using FreeRTOS background task
    void update();

    // Start background FreeRTOS task (ESP32)
    void startBackgroundTask(uint32_t stackSize = 2048, UBaseType_t priority = 1);
    void stopBackgroundTask();

private:
    void writePin(bool state);

    uint8_t _pin;
    bool _activeHigh;

    Mode _currentMode = Mode::OFF;
    BlinkConfig _blinkCfg;
    CountPatternConfig _countCfg;
    CustomPatternConfig _customCfg;

    // Pattern state tracking
    uint32_t _lastStepMs = 0;
    uint8_t _stepIndex = 0;
    bool _state = false;

    // FreeRTOS background task handle
    TaskHandle_t _taskHandle = nullptr;
    static void freertosTask(void* pvParameters);
};
