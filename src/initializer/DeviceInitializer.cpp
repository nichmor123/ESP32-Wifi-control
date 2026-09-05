#include "DeviceInitializer.h"
#include "led/StatusLedManager.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <WiFi.h>

int DeviceInitializer::initialize(String& ssidToModify, String& passwordToModify, StatusLedManager* statusLed) {
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
                
                // If it's modified, we just use whatever is in the file
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

    Serial.println("Scanning for available SSIDs to handle auto-numbering...");

    // 2. Scan networks to find a free suffix number
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);

    int n = WiFi.scanNetworks();
    Serial.printf("Scan done, found %d networks\n", n);

    int assignedNumber = 0;

    // If it is UNMODIFIED, we ALWAYS start at 1 and auto-number to avoid default conflicts.
    if (!isModified) {
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
        assignedNumber = freeNumber;
        Serial.printf("Assigned Default SSID: %s\n", ssidToModify.c_str());

        // Set the count flash pattern on StatusLedManager if provided
        if (statusLed) {
            statusLed->setAutoNumbering(freeNumber);
        }
    } 
    else {
        Serial.println("Device customized. Passing SSID to connection handler...");
    }

    return assignedNumber;
}
