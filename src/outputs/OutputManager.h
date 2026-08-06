#pragma once

#include <Arduino.h>
#include "networkAndWebserver/ProjectWsCommands.h" // For ChannelBus

class OutputManager {
public:
    OutputManager();
    void begin();
    void update(const ChannelBus& bus);
    void halt();

private:
    struct OutputConfig {
        enum Type { UNKNOWN, ESC, SERVO };
        Type type = UNKNOWN;
        uint8_t sourceChannel = 0;
        float inputRange[2] = {0.0f, 0.0f};
        float outputRange[2] = {0.0f, 0.0f};
        uint8_t pin = 0;
        uint8_t pwmChannel = 0;
    };

    static constexpr int MAX_OUTPUTS = 16;
    OutputConfig _outputs[MAX_OUTPUTS];
    uint8_t _outputCount = 0;
    uint8_t _nextPwmChannel = 0;

    void parseConfig();
    void setupPwm(OutputConfig& output);
    float mapfloat(float x, float in_min, float in_max, float out_min, float out_max);
};