async function main() {
  // Establish WebSocket connection early
  connectWebSocket();

  // Load the control map which is needed by both pages
  await loadControlMap();
  appendLog(logEl || debugEl, `Loaded controlmap.json (channels.count=${CHANNEL_COUNT}, sources=${SOURCES.length})`);

  // Initialize page-specific logic
  if (isConfigInputsPage()) {
    initConfigInputsPage();
  } else if (isIndexPage()) {
    initIndexPage();
  }
}

// Run the main entry point
main().catch(e => {
    console.error("Initialization failed:", e);
    appendLog(logEl || debugEl, "FATAL: App initialization failed. Check console.");
});