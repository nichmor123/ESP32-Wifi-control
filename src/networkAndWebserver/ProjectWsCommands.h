#pragma once
#include <stdint.h>

class WsCommandServer;

struct ChannelBus {
    static constexpr uint8_t N = 20; // set to 20 for your analog+buttons mapping
    float ch[N] = {0};
    uint32_t lastRxMs = 0;
};

void RegisterProjectWsCommands(WsCommandServer& ws);
ChannelBus GetChannelBusSnapshot();