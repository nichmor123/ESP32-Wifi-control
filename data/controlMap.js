// ---------- controlmap.json integration ----------
let controlMap = null;

// UI/runtime state derived from controlMap
let CHANNEL_COUNT = 8;
let SOURCES = []; // {id, kind, label, range:[min,max]?}
let AXES = []; // subset of SOURCES where kind==="axis"
let BUTTONS = []; // subset where kind==="button"

// mapping state is stored in controlMap.inputs.map_to_channels
// but we keep quick lookup maps for UI updates
let sourceToChannel = new Map(); // sourceId -> channelNumber (1..N)
let sourceToXform = new Map(); // sourceId -> xform object (preserved)

function defaultControlMapFallback() {
  return {
    version: 1,
    channels: { count: 20 },
    inputs: {
      device: { type: "gamepad", model: "Logitech F310", mode: "xinput" },
      sources: [
        { id: "rt", kind: "axis", label: "Right Trigger", range: [0.0, 1.0] },
        { id: "lt", kind: "axis", label: "Left Trigger", range: [0.0, 1.0] },
        { id: "lsx", kind: "axis", label: "Left Stick X", range: [-1.0, 1.0] },
        { id: "lsy", kind: "axis", label: "Left Stick Y", range: [-1.0, 1.0] },
        { id: "rsx", kind: "axis", label: "Right Stick X", range: [-1.0, 1.0] },
        { id: "rsy", kind: "axis", label: "Right Stick Y", range: [-1.0, 1.0] },
        { id: "a", kind: "button", label: "A" },
        { id: "b", kind: "button", label: "B" },
        { id: "x", kind: "button", label: "X" },
        { id: "y", kind: "button", label: "Y" },
        { id: "lb", kind: "button", label: "LB" },
        { id: "rb", kind: "button", label: "RB" },
        { id: "back", kind: "button", label: "Back" },
        { id: "start", kind: "button", label: "Start" },
        { id: "ls", kind: "button", label: "Left Stick Click" },
        { id: "rs", kind: "button", label: "Right Stick Click" },
        { id: "dup", kind: "button", label: "D-pad Up" },
        { id: "ddn", kind: "button", label: "D-pad Down" },
        { id: "dlt", kind: "button", label: "D-pad Left" },
        { id: "drt", kind: "button", label: "D-pad Right" },
      ],
      map_to_channels: [
        { source: "rt", ch: 1, xform: { type: "linear", scale: 1.0, offset: 0.0 } },
        { source: "lt", ch: 2, xform: { type: "linear", scale: 1.0, offset: 0.0 } },
        { source: "lsx", ch: 3, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: false } },
        { source: "lsy", ch: 4, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: true } },
        { source: "rsx", ch: 5, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: false } },
        { source: "rsy", ch: 6, xform: { type: "expo", deadband: 0.04, expo: 0.25, invert: true } },
        { source: "a", ch: 7, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "b", ch: 8, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "x", ch: 9, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "y", ch: 10, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "lb", ch: 11, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "rb", ch: 12, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "back", ch: 13, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "start", ch: 14, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "ls", ch: 15, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "rs", ch: 16, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "dup", ch: 17, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "ddn", ch: 18, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "dlt", ch: 19, xform: { type: "button", on: 1.0, off: 0.0 } },
        { source: "drt", ch: 20, xform: { type: "button", on: 1.0, off: 0.0 } },
      ],
    },
  };
}

async function loadControlMap() {
  const url = "/controlMap.json?v=" + Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    controlMap = await res.json();
  } catch (e) {
    appendLog(debugEl || logEl, `Failed to load /controlmap.json (${e.message}). Using fallback.`);
    controlMap = defaultControlMapFallback();
  }
  deriveRuntimeFromControlMap();
  return controlMap;
}

function deriveRuntimeFromControlMap() {
  CHANNEL_COUNT = controlMap?.channels?.count ?? 8;

  SOURCES = Array.isArray(controlMap?.inputs?.sources) ? controlMap.inputs.sources : [];
  AXES = SOURCES.filter((s) => s && s.kind === "axis");
  BUTTONS = SOURCES.filter((s) => s && s.kind === "button");

  sourceToChannel = new Map();
  sourceToXform = new Map();

  const m = Array.isArray(controlMap?.inputs?.map_to_channels) ? controlMap.inputs.map_to_channels : [];
  for (const entry of m) {
    if (!entry || typeof entry.source !== "string") continue;
    if (typeof entry.ch === "number") sourceToChannel.set(entry.source, entry.ch);
    if (entry.xform && typeof entry.xform === "object") sourceToXform.set(entry.source, entry.xform);
  }
}

function getRangeForSource(src) {
  if (Array.isArray(src.range) && src.range.length === 2) {
    const a = Number(src.range[0]);
    const b = Number(src.range[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  if (src.kind === "axis") return [-1, 1];
  return [0, 1];
}

function getSourceKind(sourceId) {
  const src = SOURCES.find((s) => s.id === sourceId);
  return src ? src.kind : null;
}

function defaultXformForKind(kind) {
  if (kind === "button") return { type: "button", on: 1.0, off: 0.0 };
  return { type: "linear", scale: 1.0, offset: 0.0 };
}