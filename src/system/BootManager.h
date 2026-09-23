#pragma once

#include <Arduino.h>
#include <LittleFS.h>

class BootManager {
public:
    BootManager();

    // Call at the very beginning of setup()
    void begin();

    // Call in main loop() to track uptime and reset boot count after STABLE_UPTIME_MS
    void update();

    // Logging function that writes to Serial and /logs/current.log
    void log(const char* format, ...);
    void logLn(const char* message);

    bool isSafeMode() const { return _isSafeMode; }
    uint8_t getBootCount() const { return _bootCount; }

    void clearSafeMode();

    String getCurrentLog() const;
    String getLastBootLog() const;

private:
    static constexpr uint8_t MAX_CRASH_COUNT = 3;
    static constexpr uint32_t STABLE_UPTIME_MS = 15000; // 15 seconds continuous run
    static constexpr size_t MAX_LOG_FILE_SIZE = 32768;   // 32 KB max log file size

    uint8_t _bootCount = 0;
    bool _isSafeMode = false;
    bool _isStable = false;
    uint32_t _bootTimeMs = 0;

    void loadAndIncrementBootCount();
    void rotateLogFiles();
    void appendToFile(const char* path, const char* str);
};