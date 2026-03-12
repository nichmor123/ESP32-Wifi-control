#include "motorstuff.h"
#include <ESP32Servo.h>

static Servo leftESC;
static Servo rightESC;


// not used anymore but kept for compatibility
uint32_t dutyFromPercent(int pct)
{
    return pct;
}

void attachPWM(int pin, int channel)
{
    // unused for ESC
}

void setUpPinModes(int L_FWD, int L_REV, int R_FWD, int R_REV, int LI_FWD, int LI_REV)
{
    // Attach ESC signals to the pins your main file already defines
    leftESC.attach(L_FWD, 1000, 2000);
    rightESC.attach(R_FWD, 1000, 2000);

    // neutral signal
    leftESC.writeMicroseconds(1500);
    rightESC.writeMicroseconds(1500);

    delay(2000); // allow ESC to arm
}

void setChannelPWM(int channel, int pct)
{
    // unused now
}

void driveMotor(int pinF, int pinR, int pct)
{
    pct = constrain(pct, -100, 100);

    int pulse;

    if(pinF == 0 && pinR == 1)
    {
        // Invert left side
        pct = -pct;
        pulse = 1500 + pct * 5;
        leftESC.writeMicroseconds(pulse);
    }
    else if(pinF == 2 && pinR == 3)
    {
        pulse = 1500 + pct * 5;
        rightESC.writeMicroseconds(pulse);
    }
}