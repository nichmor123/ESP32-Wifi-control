#include <Arduino.h>
#include <esp32-hal-ledc.h>
#include "motorstuff.h"


static inline uint32_t dutyFromPercent(int pct) {
    pct = constrain(pct, 0, 100);
    return (uint32_t)pct * PWM_MAX / 100;
}

void attachPWM(int pin, int channel) {
    ledcSetup(channel, pwmFreq, PWM_BITS);
    ledcAttachPin(pin, channel);
}

void setUpPinModes(int L_FWD, int L_REV, int R_FWD, int R_REV, int LI_FWD, int LI_REV) {
    const int pins[] = {L_FWD, L_REV, R_FWD, R_REV, LI_FWD, LI_REV};
    int temp = 0;
    for (int pin : pins) {
        pinMode(pin, OUTPUT);
        attachPWM(pin, temp++); 
    }
}

void setChannelPWM(int channel, int pct) {
    uint32_t duty = dutyFromPercent(pct);
    ledcWrite(channel, duty);
}

void driveMotor(int pinF, int pinR, int pct) {
    // Example: if channel 0-2 are forward and 3-5 are reverse for 3 motors:
    if (pct >= 0) {
        setChannelPWM(pinF, pct); // Forward
        setChannelPWM(pinR, 0); // Ensure reverse is off
    } else {
        setChannelPWM(pinF, 0); // Ensure forward is off
        setChannelPWM(pinR, -pct); // Reverse (use positive value)
    }
}