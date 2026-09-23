#include "OutputManager.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

// Servo constants
static constexpr uint32_t SERVO_FREQ = 50; // 50 Hz
static constexpr uint8_t SERVO_RESOLUTION_BITS = 16;
static constexpr uint32_t SERVO_MIN_PULSE_US = 500;
static constexpr uint32_t SERVO_MAX_PULSE_US = 2500;

// ESC constants (assuming standard 1000-2000us range)
static constexpr uint32_t ESC_FREQ = 50;
static constexpr uint8_t ESC_RESOLUTION_BITS = 16;
static constexpr uint32_t ESC_MIN_PULSE_US = 1000;
static constexpr uint32_t ESC_NEUTRAL_PULSE_US = 1500;
static constexpr uint32_t ESC_MAX_PULSE_US = 2000;

// H-Bridge constants (DC motor drivers like L298N, TB6612, DRV8833, L9110S)
static constexpr uint32_t HBRIDGE_FREQ = 20000; // 20 kHz for silent & smooth DC motor control
static constexpr uint8_t HBRIDGE_RESOLUTION_BITS = 10; // 10-bit resolution (0..1023)

OutputManager::OutputManager() {}

void OutputManager::begin() {
    Serial.println("Initializing OutputManager...");
    parseConfig();
}

void OutputManager::update(const ChannelBus& bus) {
    for (uint8_t i = 0; i < _outputCount; ++i) {
        OutputConfig& out = _outputs[i];
        if (out.sourceChannel == 0 || out.sourceChannel > ChannelBus::N) continue;

        float inputValue = bus.ch[out.sourceChannel - 1];
        float mappedValue = mapfloat(inputValue, out.inputRange[0], out.inputRange[1], out.outputRange[0], out.outputRange[1]);

        if (out.type == OutputConfig::SERVO) {
            uint32_t pulse_us = mapfloat(mappedValue, out.outputRange[0], out.outputRange[1], SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
            uint32_t period_us = 1000000 / SERVO_FREQ;
            uint32_t duty = (pulse_us * ((1 << SERVO_RESOLUTION_BITS) - 1)) / period_us;
            ledcWrite(out.pwmChannel, duty);
        } else if (out.type == OutputConfig::ESC) {
            uint32_t pulse_us = mapfloat(mappedValue, out.outputRange[0], out.outputRange[1], ESC_MIN_PULSE_US, ESC_MAX_PULSE_US);
            uint32_t period_us = 1000000 / ESC_FREQ;
            uint32_t duty = (pulse_us * ((1 << ESC_RESOLUTION_BITS) - 1)) / period_us;
            ledcWrite(out.pwmChannel, duty);
        } else if (out.type == OutputConfig::HBRIDGE) {
            float speedPct = mapfloat(mappedValue, out.outputRange[0], out.outputRange[1], -100.0f, 100.0f);
            speedPct = constrain(speedPct, -100.0f, 100.0f);

            uint32_t maxDuty = (1 << HBRIDGE_RESOLUTION_BITS) - 1; // 1023
            uint32_t duty1 = 0;
            uint32_t duty2 = 0;

            if (speedPct > 0.1f) {
                duty1 = (uint32_t)((speedPct / 100.0f) * maxDuty);
                duty2 = 0;
            } else if (speedPct < -0.1f) {
                duty1 = 0;
                duty2 = (uint32_t)((fabs(speedPct) / 100.0f) * maxDuty);
            } else {
                duty1 = 0;
                duty2 = 0;
            }

            ledcWrite(out.pwmChannel, duty1);
            ledcWrite(out.pwmChannel2, duty2);
        }
    }
}

void OutputManager::halt() {
    for (uint8_t i = 0; i < _outputCount; ++i) {
        OutputConfig& out = _outputs[i];
        if (out.type == OutputConfig::SERVO) {
            uint32_t pulse_us = mapfloat(90, 0, 180, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
            uint32_t period_us = 1000000 / SERVO_FREQ;
            uint32_t duty = (pulse_us * ((1 << SERVO_RESOLUTION_BITS) - 1)) / period_us;
            ledcWrite(out.pwmChannel, duty);
        } else if (out.type == OutputConfig::ESC) {
            uint32_t pulse_us = ESC_NEUTRAL_PULSE_US;
            uint32_t period_us = 1000000 / ESC_FREQ;
            uint32_t duty = (pulse_us * ((1 << ESC_RESOLUTION_BITS) - 1)) / period_us;
            ledcWrite(out.pwmChannel, duty);
        } else if (out.type == OutputConfig::HBRIDGE) {
            ledcWrite(out.pwmChannel, 0);
            ledcWrite(out.pwmChannel2, 0);
        }
    }
}

void OutputManager::parseConfig() {
    File file = LittleFS.open("/config/outputMap.json");
    if (!file) {
        Serial.println("Failed to open outputMap.json");
        return;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.print("deserializeJson() failed: ");
        Serial.println(error.c_str());
        return;
    }

    JsonArray outputsArray = doc["outputs"].as<JsonArray>();
    if (outputsArray.isNull()) return;

    _outputCount = 0;
    for (JsonVariant v : outputsArray) {
        if (_outputCount >= MAX_OUTPUTS) break;

        JsonObject obj = v.as<JsonObject>();
        OutputConfig& cfg = _outputs[_outputCount];

                if (strcmp(obj["type"], "esc") == 0) cfg.type = OutputConfig::ESC;
        else if (strcmp(obj["type"], "servo") == 0) cfg.type = OutputConfig::SERVO;
        else if (strcmp(obj["type"], "hbridge") == 0) cfg.type = OutputConfig::HBRIDGE;
        else continue;

        cfg.sourceChannel = obj["sourceChannel"];
        cfg.inputRange[0] = obj["inputRange"][0];
        cfg.inputRange[1] = obj["inputRange"][1];
        cfg.outputRange[0] = obj["outputRange"][0];
        cfg.outputRange[1] = obj["outputRange"][1];

                if (cfg.type == OutputConfig::HBRIDGE) {
                    cfg.pin = obj["pins"]["in1"].as<int>() ? obj["pins"]["in1"].as<int>() : (obj["pins"]["pwm"].as<int>() ? obj["pins"]["pwm"].as<int>() : 0);
                    cfg.pin2 = obj["pins"]["in2"].as<int>() ? obj["pins"]["in2"].as<int>() : 0;

                    if (cfg.pin == 0 || cfg.pin2 == 0) {
                        Serial.printf("Output %d (HBridge): Both IN1 (%u) and IN2 (%u) pins are required. Skipping.\n", _outputCount, cfg.pin, cfg.pin2);
                        continue;
                    }

                    if (_nextPwmChannel + 1 < MAX_PWM_CHANNELS) {
                        cfg.pwmChannel = _nextPwmChannel++;
                        cfg.pwmChannel2 = _nextPwmChannel++;

                        ledcSetup(cfg.pwmChannel, HBRIDGE_FREQ, HBRIDGE_RESOLUTION_BITS);
                        ledcAttachPin(cfg.pin, cfg.pwmChannel);

                        ledcSetup(cfg.pwmChannel2, HBRIDGE_FREQ, HBRIDGE_RESOLUTION_BITS);
                        ledcAttachPin(cfg.pin2, cfg.pwmChannel2);

                        _outputCount++;
                    } else {
                        Serial.printf("Warning: Exceeded maximum %u PWM channels for this target. Output %d ignored.\n", MAX_PWM_CHANNELS, _outputCount);
                    }
                } else {
                    cfg.pin = obj["pins"]["pwm"].as<int>() ? obj["pins"]["pwm"].as<int>() : (obj["pins"]["in1"].as<int>() ? obj["pins"]["in1"].as<int>() : 0);
                    if (cfg.pin == 0) {
                        Serial.printf("Output %d (%s): Invalid PWM pin (0). Skipping.\n", _outputCount, cfg.type == OutputConfig::SERVO ? "Servo" : "ESC");
                        continue;
                    }

                    if (_nextPwmChannel < MAX_PWM_CHANNELS) {
                        cfg.pwmChannel = _nextPwmChannel++;
                        uint32_t freq = (cfg.type == OutputConfig::SERVO) ? SERVO_FREQ : ESC_FREQ;
                        uint8_t resolution = (cfg.type == OutputConfig::SERVO) ? SERVO_RESOLUTION_BITS : ESC_RESOLUTION_BITS;
                        ledcSetup(cfg.pwmChannel, freq, resolution);
                        ledcAttachPin(cfg.pin, cfg.pwmChannel);
                        _outputCount++;
                    } else {
                        Serial.printf("Warning: Exceeded maximum %u PWM channels for this target. Output %d ignored.\n", MAX_PWM_CHANNELS, _outputCount);
                    }
                }
    }
    Serial.printf("Parsed and configured %u outputs.\n", _outputCount);
}

float OutputManager::mapfloat(float x, float in_min, float in_max, float out_min, float out_max) {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}