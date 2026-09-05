// ---------- keyboard state tracking ----------
const keyboardState = {};

window.addEventListener("keydown", (e) => {
  const tag = e.target?.tagName.toLowerCase() ?? "";
  if (["input", "textarea", "select"].includes(tag)) return;
  
  // Note: Space is reserved for emergency stop on main index page
  const codeMap = {
    KeyW: "k_w",
    KeyA: "k_a",
    KeyS: "k_s",
    KeyD: "k_d",
    KeyQ: "k_q",
    KeyE: "k_e",
    KeyR: "k_r",
    KeyF: "k_f",
    ShiftLeft: "k_shift",
    ShiftRight: "k_shift",
    ControlLeft: "k_ctrl",
    ControlRight: "k_ctrl",
    ArrowUp: "k_arrowup",
    ArrowDown: "k_arrowdown",
    ArrowLeft: "k_arrowleft",
    ArrowRight: "k_arrowright"
  };

  const srcId = codeMap[e.code];
  if (srcId) {
    keyboardState[srcId] = true;
  }
});

window.addEventListener("keyup", (e) => {
  const tag = e.target?.tagName.toLowerCase() ?? "";
  if (["input", "textarea", "select"].includes(tag)) return;

  const codeMap = {
    KeyW: "k_w",
    KeyA: "k_a",
    KeyS: "k_s",
    KeyD: "k_d",
    KeyQ: "k_q",
    KeyE: "k_e",
    KeyR: "k_r",
    KeyF: "k_f",
    ShiftLeft: "k_shift",
    ShiftRight: "k_shift",
    ControlLeft: "k_ctrl",
    ControlRight: "k_ctrl",
    ArrowUp: "k_arrowup",
    ArrowDown: "k_arrowdown",
    ArrowLeft: "k_arrowleft",
    ArrowRight: "k_arrowright"
  };

  const srcId = codeMap[e.code];
  if (srcId) {
    keyboardState[srcId] = false;
  }
});

function readKeyboardState() {
  return keyboardState;
}

// Apply xform from controlmap.json (minimal set: linear/expo/button)
function applyXform(raw, kind, xform) {
  const xf = xform || defaultXformForKind(kind);

  if (xf.type === "button") {
    const pressed = !!raw;
    return pressed ? (xf.on ?? 1.0) : (xf.off ?? 0.0);
  }

  let v = Number(raw) || 0;

  if (xf.invert) v = -v;

  if (typeof xf.deadband === "number" && xf.deadband > 0) {
    const db = xf.deadband;
    if (Math.abs(v) < db) v = 0;
    else {
      const sign = v >= 0 ? 1 : -1;
      v = (sign * (Math.abs(v) - db)) / (1.0 - db);
    }
  }

  if (typeof xf.expo === "number") {
    const e = clamp(xf.expo, 0, 1);
    v = (1.0 - e) * v + e * v * v * v;
  }

  if (typeof xf.scale === "number") v *= xf.scale;
  if (typeof xf.offset === "number") v += xf.offset;

  v = clamp(v, -1, 1);
  return v;
}

function computeChannelsFromState(state) {
  const onMobile = typeof isMobilePage === "function" && isMobilePage();

  // Create a map of all available input values
  const allInputValues = {};

  if (onMobile) {
    // On Mobile page: process only mobile analog & digital state
    for (const key in state.analog) {
      if (key.startsWith("m_")) allInputValues[key] = state.analog[key];
    }
    for (const key in state.digital) {
      if (key.startsWith("m_")) allInputValues[key] = state.digital[key] ? 1.0 : 0.0;
    }
  } else {
    // On Main/Desktop page: process gamepad and keyboard state, ignoring mobile sources (m_)
    for (const key in state.analog) {
      if (!key.startsWith("m_")) allInputValues[key] = state.analog[key];
    }
    for (const key in state.digital) {
      if (!key.startsWith("m_")) allInputValues[key] = state.digital[key] ? 1.0 : 0.0;
    }
    for (const key in keyboardState) {
      if (!key.startsWith("m_")) allInputValues[key] = keyboardState[key] ? 1.0 : 0.0;
    }
  }

  // Calculate mix values
  const mixes = Array.isArray(controlMap?.inputs?.mixes) ? controlMap.inputs.mixes : [];
  mixes.forEach(mix => {
    let mixValue = 0;
    (mix.positive || []).forEach(srcId => {
      // Ignore source if on mobile and source is desktop or vice versa
      if (onMobile && !srcId.startsWith("m_") && !srcId.startsWith("mix_")) return;
      if (!onMobile && srcId.startsWith("m_")) return;
      mixValue += allInputValues[srcId] || 0;
    });
    (mix.negative || []).forEach(srcId => {
      if (onMobile && !srcId.startsWith("m_") && !srcId.startsWith("mix_")) return;
      if (!onMobile && srcId.startsWith("m_")) return;
      mixValue -= allInputValues[srcId] || 0;
    });
    // Clamp the result to the standard -1 to 1 range
    allInputValues[mix.id] = clamp(mixValue, -1, 1);
  });

  const out = new Array(CHANNEL_COUNT).fill(0);
  const mappings = Array.isArray(controlMap?.inputs?.map_to_channels) ? controlMap.inputs.map_to_channels : [];

  for (const m of mappings) {
    if (!m || typeof m.source !== "string" || typeof m.ch !== "number") continue;
    const chIdx = m.ch - 1;
    if (chIdx < 0 || chIdx >= CHANNEL_COUNT) continue;

    const sourceId = m.source;

    // Ignore mobile mappings when on Main page, and ignore gamepad/keyboard mappings when on Mobile page
    if (onMobile && !sourceId.startsWith("m_") && !sourceId.startsWith("mix_")) continue;
    if (!onMobile && sourceId.startsWith("m_")) continue;

    const rawValue = allInputValues[sourceId] || 0;

    const kind = getSourceKind(sourceId);
    if (!kind) continue;

    const v = applyXform(rawValue, kind, m.xform);
    out[chIdx] = v;
  }

  return out;
}

// ---------- gamepad (F310 XInput) readout ----------
function readGamepadStateF310(gp) {
  const axes = gp.axes || [];
  const b = gp.buttons || [];

  const analog = {
    rt: clamp01(b[7]?.value ?? 0),
    lt: clamp01(b[6]?.value ?? 0),
    lsx: clamp(axes[0] ?? 0, -1, 1),
    lsy: clamp(axes[1] ?? 0, -1, 1),
    rsx: clamp(axes[2] ?? 0, -1, 1),
    rsy: clamp(axes[3] ?? 0, -1, 1),
  };

  const digital = {
    a: b[0]?.pressed ?? false,
    b: b[1]?.pressed ?? false,
    x: b[2]?.pressed ?? false,
    y: b[3]?.pressed ?? false,
    lb: b[4]?.pressed ?? false,
    rb: b[5]?.pressed ?? false,
    back: b[8]?.pressed ?? false,
    start: b[9]?.pressed ?? false,
    ls: b[10]?.pressed ?? false,
    rs: b[11]?.pressed ?? false,
    dup: b[12]?.pressed ?? false,
    ddn: b[13]?.pressed ?? false,
    dlt: b[14]?.pressed ?? false,
    drt: b[15]?.pressed ?? false,
  };

  return { analog, digital };
}

function getFirstGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) if (gp) return gp;
  return null;
}