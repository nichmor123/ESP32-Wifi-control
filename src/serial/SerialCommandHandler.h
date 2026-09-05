#pragma once

#include <Arduino.h>

class SerialCommandHandler {
public:
    SerialCommandHandler() = default;

    void begin();
    void update();

private:
    void processCommand(const String& line);
    void printHelp();
    void printWifiConfig();
    void handleSetWifi(const String& argsStr);
    void handleRestart();
    void printStatus();

    String _buffer;
};
