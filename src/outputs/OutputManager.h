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
            enum Type { UNKNOWN, ESC, SERVO, HBRIDGE };
            Type type = UNKNOWN;
            uint8_t sourceChannel = 0;
            float inputRange[2] = {0.0f, 0.0f};
            float outputRange[2] = {0.0f, 0.0f};
            uint8_t pin = 0;          // PWM pin (ESC/Servo) or IN1 pin (HBridge)
            uint8_t pin2 = 0;         // IN2 pin (HBridge)
            uint8_t pwmChannel = 0;   // LEDC channel for pin / IN1
            uint8_t pwmChannel2 = 0;  // LEDC channel for IN2
        };

    #if defined(SOC_LEDC_CHANNEL_NUM)
    static constexpr uint8_t MAX_PWM_CHANNELS = SOC_LEDC_CHANNEL_NUM;
#elif defined(CONFIG_IDF_TARGET_ESP32S3) || defined(ESP32S3)
    static constexpr uint8_t MAX_PWM_CHANNELS = 8;
#else
    static constexpr uint8_t MAX_PWM_CHANNELS = 16;
#endif

    static constexpr int MAX_OUTPUTS = 16;
    OutputConfig _outputs[MAX_OUTPUTS];
    uint8_t _outputCount = 0;
    uint8_t _nextPwmChannel = 0;

    void parseConfig();
    void setupPwm(OutputConfig& output);
    float mapfloat(float x, float in_min, float in_max, float out_min, float out_max);
};