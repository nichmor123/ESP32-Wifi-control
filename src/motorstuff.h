#pragma once

#include <Arduino.h>


static uint32_t pwmFreq = 20000;      
static const uint8_t PWM_BITS = 8;  
static const uint16_t PWM_MAX = (1U << PWM_BITS) - 1;


static inline uint32_t dutyFromPercent(int pct);
void attachPWM(int pin, int channel);
void setUpPinModes(int L_FWD, int L_REV, int R_FWD, int R_REV, int LI_FWD, int LI_REV);
void setChannelPWM(int channel, int pct);
void driveMotor(int pinF, int pinR, int pct);