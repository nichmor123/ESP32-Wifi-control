#include "DeviceInitializer.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <WiFi.h>

#ifndef BUILTIN_LED
#define BUILTIN_LED 2 // Default for many ESP32 boards
#endif

// Shared variables for the task
static int g_flashNumber = 0;
static bool g_shouldFlash = false;
static TaskHandle_t g_ledTaskHandle = nullptr;

// FreeRTOS Task to handle flashing the LED
static void ledFlashTask(void* pvParameters) {
    pinMode(BUILTIN_LED, OUTPUT);
    digitalWrite(BUILTIN_LED, LOW);

    while (g_shouldFlash && g_flashNumber > 0) {
        // Flash the number
        for (int i = 0; i < g_flashNumber; i++) {
            digitalWrite(BUILTIN_LED, HIGH);
            vTaskDelay(pdMS_TO_TICKS(200));
            digitalWrite(BUILTIN_LED, LOW);
            vTaskDelay(pdMS_TO_TICKS(300));
        }

        // Pause
        vTaskDelay(pdMS_TO_TICKS(1500));

        // Flash the number again
        for (int i = 0; i < g_flashNumber; i++) {
            digitalWrite(BUILTIN_LED, HIGH);
            vTaskDelay(pdMS_TO_TICKS(200));
            digitalWrite(BUILTIN_LED, LOW);
            vTaskDelay(pdMS_TO_TICKS(300));
        }

        // Long pause before repeating the sequence
        vTaskDelay(pdMS_TO_TICKS(3000));
    }

    // Task cleanup
    digitalWrite(BUILTIN_LED, LOW);
    g_ledTaskHandle = nullptr;
    vTaskDelete(NULL);
}

void DeviceInitializer::initialize(String& ssidToModify, String& passwordToModify) {
    bool isModified = false;
    
    // 1. Read wifi.json to check modified status
    File wifiFile = LittleFS.open("/wifi.json", "r");
    if (wifiFile) {
        JsonDocument wifiDoc;
        if (!deserializeJson(wifiDoc, wifiFile)) {
            // Check if it has a modified flag
            int modified = wifiDoc["modified"] | 0;
            if (modified > 0) {
                isModified = true;
                
                // If it's modified, we just use whatever is in the file (main.cpp does this, but we can do it here safely too)
                const char* savedSsid = wifiDoc["ssid"];
                const char* savedPass = wifiDoc["password"];
                if (savedSsid && strlen(savedSsid) > 0) {
                    ssidToModify = String(savedSsid);
                }
                if (savedPass) {
                    passwordToModify = String(savedPass);
                }
            }
        }
        wifiFile.close();
    }
    
    // If it has been modified, we do not scan or flash.
    if (isModified) {
        Serial.println("Device previously modified. Skipping AP scanning and LED flashing.");
        return;
    }

    Serial.println("Device not modified. Scanning for available SSIDs to find an open number...");

    // 2. Scan networks to find a free suffix number
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);

    int n = WiFi.scanNetworks();
    Serial.printf("Scan done, found %d networks\n", n);

    int freeNumber = 1; // Default to 1

    if (n > 0) {
        bool numberUsed = true;
        
        while (numberUsed && freeNumber <= 9) { // Check up to 9
            numberUsed = false;
            String targetSsid = ssidToModify + "-" + String(freeNumber);
            
            for (int i = 0; i < n; ++i) {
                if (WiFi.SSID(i) == targetSsid) {
                    numberUsed = true;
                    break;
                }
            }
            if (numberUsed) {
                freeNumber++;
            }
        }
    }
    
    // Add the suffix to the SSID
    ssidToModify = ssidToModify + "-" + String(freeNumber);
    Serial.printf("Assigned SSID: %s\n", ssidToModify.c_str());

    // 3. Start the background FreeRTOS LED task
    g_flashNumber = freeNumber;
    g_shouldFlash = true;
    
    xTaskCreate(
        ledFlashTask,      // Task function
        "LED_Flash_Task",  // Name
        2048,              // Stack size
        NULL,              // Parameters
        1,                 // Priority
        &g_ledTaskHandle   // Task handle
    );
}
