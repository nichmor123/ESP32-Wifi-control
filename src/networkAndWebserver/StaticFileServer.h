#pragma once

#include <Arduino.h>
#include <ESPAsyncWebServer.h>

class StaticFileServer {
public:
    struct Config {
        uint16_t port;
        bool mountFS;
        bool formatOnFail;
        const char* defaultFile;

        Config(); // defined in .cpp
    };

    explicit StaticFileServer(const Config& cfg);

    // AsyncWebServer is non-copyable; make that explicit
    StaticFileServer(const StaticFileServer&) = delete;
    StaticFileServer& operator=(const StaticFileServer&) = delete;

    bool begin();

    void addPageRoute(const char* urlPath,
                      const char* filePath,
                      const char* contentType = "text/html");

    AsyncWebServer& server();

private:
    void sendFile(AsyncWebServerRequest* req,
                  const char* path,
                  const char* contentType);

    Config _cfg;
    AsyncWebServer _server;
};