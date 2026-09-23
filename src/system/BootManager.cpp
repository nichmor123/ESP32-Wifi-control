#include "BootManager.h"
#include <cstdarg>

BootManager::BootManager() {}

void BootManager::begin() {
    _bootTimeMs = millis();

    if (!LittleFS.begin(true)) {
        Serial.println("[BootManager] LittleFS mount failed!");
    }

    if (!LittleFS.exists("/config")) {
        LittleFS.mkdir("/config");
    }
    if (!LittleFS.exists("/logs")) {
        LittleFS.mkdir("/logs");
    }

    // Rotate log files before writing new boot entries
    rotateLogFiles();

    // Read and increment consecutive boot/crash counter
    loadAndIncrementBootCount();

    log("========================================");
    log("ESP32 System Startup");
    log("Boot Count: %u (Max before safe mode: %u)", _bootCount, MAX_CRASH_COUNT);
    log("Reset Reason: %s", esp_err_to_name(esp_reset_reason()));

    if (_isSafeMode) {
        log("[SAFE MODE ACTIVE] Consecutively restarted %u times without reaching 15s uptime.", _bootCount);
        log("[SAFE MODE ACTIVE] Hardware outputs are DISABLED for safety.");
    } else {
        log("[NORMAL MODE] Controller initialized successfully.");
    }
}

void BootManager::update() {
    if (!_isStable && (millis() - _bootTimeMs >= STABLE_UPTIME_MS)) {
        _isStable = true;
        if (_bootCount > 0) {
            log("[BootManager] System stable (>%u ms uptime). Resetting crash count (%u -> 0).", STABLE_UPTIME_MS, _bootCount);
            _bootCount = 0;
            File f = LittleFS.open("/config/boot_count.txt", "w");
            if (f) {
                f.print("0");
                f.close();
            }
        }
    }
}

void BootManager::loadAndIncrementBootCount() {
    _bootCount = 0;
    if (LittleFS.exists("/config/boot_count.txt")) {
        File f = LittleFS.open("/config/boot_count.txt", "r");
        if (f) {
            String val = f.readString();
            _bootCount = (uint8_t)val.toInt();
            f.close();
        }
    }

    _bootCount++;

    File f = LittleFS.open("/config/boot_count.txt", "w");
    if (f) {
        f.printf("%u", _bootCount);
        f.close();
    }

    if (_bootCount >= MAX_CRASH_COUNT) {
        _isSafeMode = true;
    } else {
        _isSafeMode = false;
    }
}

void BootManager::rotateLogFiles() {
    if (LittleFS.exists("/logs/current.log")) {
        if (LittleFS.exists("/logs/last_boot.log")) {
            LittleFS.remove("/logs/last_boot.log");
        }
        LittleFS.rename("/logs/current.log", "/logs/last_boot.log");
    }

    // Create fresh current.log
    File f = LittleFS.open("/logs/current.log", "w");
    if (f) {
        f.close();
    }
}

void BootManager::log(const char* format, ...) {
    char buffer[256];
    va_list args;
    va_start(args, format);
    vsnprintf(buffer, sizeof(buffer), format, args);
    va_end(args);

    uint32_t sec = millis() / 1000;
    uint32_t ms = millis() % 1000;
    char timeStr[32];
    snprintf(timeStr, sizeof(timeStr), "[%02u:%02u.%03u] ", sec / 60, sec % 60, ms);

    Serial.print(timeStr);
    Serial.println(buffer);

    char fullLine[300];
    snprintf(fullLine, sizeof(fullLine), "%s%s\n", timeStr, buffer);
    appendToFile("/logs/current.log", fullLine);
}

void BootManager::logLn(const char* message) {
    log("%s", message);
}

void BootManager::appendToFile(const char* path, const char* str) {
    if (!LittleFS.exists(path)) return;

    File f = LittleFS.open(path, "a");
    if (f) {
        if (f.size() < MAX_LOG_FILE_SIZE) {
            f.print(str);
        }
        f.close();
    }
}

void BootManager::clearSafeMode() {
    _bootCount = 0;
    _isSafeMode = false;
    File f = LittleFS.open("/config/boot_count.txt", "w");
    if (f) {
        f.print("0");
        f.close();
    }
    log("[BootManager] Safe mode manually cleared by user.");
}

String BootManager::getCurrentLog() const {
    if (!LittleFS.exists("/logs/current.log")) return "No current log found.";
    File f = LittleFS.open("/logs/current.log", "r");
    if (!f) return "Error opening current log.";
    String content = f.readString();
    f.close();
    return content;
}

String BootManager::getLastBootLog() const {
    if (!LittleFS.exists("/logs/last_boot.log")) return "No last boot log found.";
    File f = LittleFS.open("/logs/last_boot.log", "r");
    if (!f) return "Error opening last boot log.";
    String content = f.readString();
    f.close();
    return content;
}