async function main() {
  // Establish WebSocket connection early
  connectWebSocket();
  
  // Load profiles directory registry
  await loadProfilesConfig();

  // Initialize page-specific logic
  if (isConfigInputsPage()) {
    await loadControlMap();
    appendLog(debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);
    initConfigInputsPage();
  } else if (isMobilePage()) {
    await loadControlMap();
    // No log element on mobile page, so no log output here
    initMobilePage();
  } else if (isOutputConfigPage()) {
    await loadControlMap(); // Needed for channel count
    initOutputConfigPage();
  } else if (isBatteryPage()) {
    initBatteryPage();
  } else if (isTroubleshootingPage()) {
    initTroubleshootingPage();
    } else if (isIndexPage()) {
    await loadControlMap();
    appendLog(logEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);
    initIndexPage();
  } else if (isSettingsPage()) {
    initSettingsPage();
  }
}

// Run the main entry point
main().catch(e => {
    console.error("Initialization failed:", e);
    appendLog(logEl || debugEl, "FATAL: App initialization failed. Check console.");
});