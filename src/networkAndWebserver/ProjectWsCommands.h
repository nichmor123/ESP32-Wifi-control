#pragma once
#include <stdint.h>

class WsCommandServer;

struct ChannelBus {
    // Change this number to add/remove channels.
    static constexpr uint8_t N = 20;

    // Normalized channels, recommended range: -1.0 .. +1.0
    float ch[N] = {0};

    // millis() timestamp of last received update (for failsafe)
    uint32_t lastRxMs = 0;
};

// Register websocket commands for this project.
void RegisterProjectWsCommands(WsCommandServer& ws);

// Safe read for control loop: returns a copy/snapshot.
ChannelBus GetChannelBusSnapshot();