#include <Arduino.h>
#include <LittleFS.h>

#include "system/BootManager.h"
#include "networkAndWebserver/NetworkManager.h"
#include "outputs/OutputManager.h"
#include "sensors/BatteryMonitor.h"
#include "led/StatusLedManager.h"
#include "serial/SerialCommandHandler.h"

BootManager bootManager;
NetworkManager networkManager;
OutputManager outputManager;
BatteryMonitor batteryMonitor;
SerialCommandHandler serialHandler;

#ifndef BUILTIN_LED
#define BUILTIN_LED 2
#endif

StatusLedManager statusLed(BUILTIN_LED, true);

// --- timing ---
static constexpr uint32_t CONTROL_DT_MS  = 10;   // 100 Hz control tick
static constexpr uint32_t RX_TIMEOUT_MS  = 300;  // failsafe if no RX for 300ms
static constexpr uint32_t PRINT_DT_MS    = 1000; // 1 Hz prints & battery broadcast

static uint32_t lastControlMs = 0;
static uint32_t lastPrintMs   = 0;

void setup() {
    Serial.begin(921600);

    // 1. Initialize Boot & Restart Monitor first
    bootManager.begin();

    // 2. Start LED manager
    statusLed.begin();

    // 3. Initialize network, AP/STA, mDNS, web server, and WebSocket commands
    if (!networkManager.begin(&statusLed)) {
        bootManager.log("Network initialization failed, restarting...");
        delay(2000);
        ESP.restart();
    }

    // 4. Initialize hardware outputs ONLY if not in Safe Mode
    if (bootManager.isSafeMode()) {
        bootManager.log("[SAFE MODE ACTIVE] Output drivers bypassed. Web server running for recovery.");
    } else {
        outputManager.begin();
    }

    batteryMonitor.begin();
    serialHandler.begin();

    bootManager.log("Setup complete.");
}

void loop() {
    const uint32_t now = millis();

    // Track uptime stability for BootManager
    bootManager.update();

    // Process incoming serial CLI commands
    serialHandler.update();

    // Clean up disconnected WebSocket clients
    networkManager.update();

    // Copy ONCE per tick (one lock/unlock)
    const ChannelBus bus = GetChannelBusSnapshot();
    const bool isRxActive = (bus.lastRxMs != 0) && ((uint32_t)(now - bus.lastRxMs) <= RX_TIMEOUT_MS);
    const size_t wsClients = networkManager.getWsServer().getClientCount();

    // Update system LED status manager
    statusLed.update(isRxActive, wsClients);

    // Fixed-rate control tick (100 Hz)
    if ((uint32_t)(now - lastControlMs) >= CONTROL_DT_MS) {
        lastControlMs = now;

        if (bootManager.isSafeMode() || !isRxActive) {
            // FAILSAFE / SAFE MODE: keep outputs halted
            outputManager.halt();
        } else {
            // NORMAL CONTROL: update outputs from channel data
            outputManager.update(bus);
        }
    }

    // Fixed-rate sensor/broadcast tick (1 Hz)
    if ((uint32_t)(now - lastPrintMs) >= PRINT_DT_MS) {
        lastPrintMs = now;

        // Update battery monitor
        batteryMonitor.update();
        
        // Broadcast battery status if enabled and WebSocket clients are connected
        if (batteryMonitor.isEnabled() && wsClients > 0) {
            JsonDocument doc;
            doc["cmd"] = "battery_update";
            JsonObject data = doc["data"].to<JsonObject>();
            data["voltage"] = batteryMonitor.getVoltage();
            data["percentage"] = batteryMonitor.getPercentage();
            String output;
            serializeJson(doc, output);
            networkManager.getWsServer().broadcastText(output.c_str());
        }
    }
}