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

        uint32_t pulse_us = 0;
        if (out.type == OutputConfig::SERVO) {
            pulse_us = mapfloat(mappedValue, out.outputRange[0], out.outputRange[1], SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
        } else if (out.type == OutputConfig::ESC) {
            pulse_us = mapfloat(mappedValue, out.outputRange[0], out.outputRange[1], ESC_MIN_PULSE_US, ESC_MAX_PULSE_US);
        }

        if (pulse_us > 0) {
            uint32_t period_us = 1000000 / (out.type == OutputConfig::SERVO ? SERVO_FREQ : ESC_FREQ);
            uint32_t duty = (pulse_us * ((1 << (out.type == OutputConfig::SERVO ? SERVO_RESOLUTION_BITS : ESC_RESOLUTION_BITS)) - 1)) / period_us;
            ledcWrite(out.pwmChannel, duty);
        }
    }
}

void OutputManager::halt() {
    for (uint8_t i = 0; i < _outputCount; ++i) {
        OutputConfig& out = _outputs[i];
        uint32_t pulse_us = 0;
        if (out.type == OutputConfig::SERVO) {
            // Go to 90 degrees as a safe position, assuming a 0-180 range
            pulse_us = mapfloat(90, 0, 180, SERVO_MIN_PULSE_US, SERVO_MAX_PULSE_US);
        } else if (out.type == OutputConfig::ESC) {
            pulse_us = ESC_NEUTRAL_PULSE_US;
        }

        if (pulse_us > 0) {
            uint32_t period_us = 1000000 / (out.type == OutputConfig::SERVO ? SERVO_FREQ : ESC_FREQ);
            uint32_t duty = (pulse_us * ((1 << (out.type == OutputConfig::SERVO ? SERVO_RESOLUTION_BITS : ESC_RESOLUTION_BITS)) - 1)) / period_us;
            ledcWrite(out.pwmChannel, duty);
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
        else continue;

        cfg.sourceChannel = obj["sourceChannel"];
        cfg.inputRange[0] = obj["inputRange"][0];
        cfg.inputRange[1] = obj["inputRange"][1];
        cfg.outputRange[0] = obj["outputRange"][0];
        cfg.outputRange[1] = obj["outputRange"][1];
        cfg.pin = obj["pins"]["pwm"];

        if (_nextPwmChannel < 16) {
            cfg.pwmChannel = _nextPwmChannel++;
            uint32_t freq = (cfg.type == OutputConfig::SERVO) ? SERVO_FREQ : ESC_FREQ;
            uint8_t resolution = (cfg.type == OutputConfig::SERVO) ? SERVO_RESOLUTION_BITS : ESC_RESOLUTION_BITS;
            ledcSetup(cfg.pwmChannel, freq, resolution);
            ledcAttachPin(cfg.pin, cfg.pwmChannel);
            _outputCount++;
        }
    }
    Serial.printf("Parsed and configured %u outputs.\n", _outputCount);
}

float OutputManager::mapfloat(float x, float in_min, float in_max, float out_min, float out_max) {
    return (x - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}