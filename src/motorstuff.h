#pragma once

#include <Arduino.h>

uint32_t dutyFromPercent(int pct);
void attachPWM(int pin, int channel);
void setUpPinModes(int L_FWD, int L_REV, int R_FWD, int R_REV, int LI_FWD, int LI_REV);
void setChannelPWM(int channel, int pct);
void driveMotor(int pinF, int pinR, int pct);