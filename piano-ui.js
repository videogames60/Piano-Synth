// ============================================
// piano-ui.js — Keyboard, presets, sound designer
// ============================================

const pianoEl = document.getElementById('piano');
const vizEl = document.getElementById('visualizer');
const vizCanvas = document.getElementById('vizCanvas');
const hintEl = document.getElementById('hint');
const octControls = document.getElementById('octaveControls');
const octDisplay = document.getElementById('octDisplay');
const sustainBtn = document.getElementById('sustainBtn');
const labelsBtn = document.getElementById('labelsBtn');
const transDisplay = document.getElementById('transDisplay');
const layoutStdBtn = document.getElementById('layoutStd');
const layoutExtBtn = document.getElementById('layoutExt');
const layoutFullBtn = document.getElementById('layoutFull');
const presetBar = document.getElementById('presetBar');
const designerToggle = document.getElementById('designerToggle');
const soundDesigner = document.getElementById('soundDesigner');
const midiStatus = document.getElementById('midiStatus');

let currentLayout = 'standard';
let currentOctave = 4;
let sustain = false;
let showLabels = true;
const activeNotes = {};
const sustainedNotes = {};

// MIDI hardware state
const activeMidiHwNotes = {}; // midi number -> noteObj
let midiAccess = null;
let midiDeviceName = null;

// ============================================
// PRESET BAR (dropdown)
// ============================================
function buildPresetBar() {
  presetBar.innerHTML = '';
  const select = document.createElement('select');
  select.className = 'preset-select';
  select.id = 'presetSelect';
  getPresetNames().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === currentPresetName) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    loadPreset(select.value);
    syncDesignerUI();
  });
  presetBar.appendChild(select);
}

// Keep preset dropdown in sync when preset changes externally
function syncPresetDropdown() {
  const sel = document.getElementById('presetSelect');
  if (!sel) return;
  // If current preset is "Custom", check if the option exists
  let found = false;
  for (const opt of sel.options) {
    if (opt.value === currentPresetName) { found = true; break; }
  }
  if (!found && currentPresetName === 'Custom') {
    const opt = document.createElement('option');
    opt.value = 'Custom';
    opt.textContent = '✦ Custom';
    sel.appendChild(opt);
  }
  sel.value = currentPresetName;
}

// ============================================
// SOUND DESIGNER PANEL
// ============================================
designerToggle.addEventListener('click', () => {
  const isOpen = soundDesigner.classList.toggle('open');
  designerToggle.classList.toggle('active', isOpen);
});

// Stored gain values for OSC 2/3 so toggling off/on preserves them
const oscSavedGain = { osc2: null, osc3: null };

function setupOscToggle(btnId, oscKey) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  // Determine initial enabled state from current gain
  let enabled = synthParams[oscKey].gain > 0;
  if (enabled) oscSavedGain[oscKey] = synthParams[oscKey].gain;
  applyOscToggleState(btn, oscKey, enabled);

  btn.addEventListener('click', () => {
    enabled = !enabled;
    if (enabled) {
      // Restore saved gain (or fallback to a sensible default)
      synthParams[oscKey].gain = oscSavedGain[oscKey] || 0.2;
    } else {
      oscSavedGain[oscKey] = synthParams[oscKey].gain;
      synthParams[oscKey].gain = 0;
    }
    applyOscToggleState(btn, oscKey, enabled);
    // Sync the gain slider UI
    const gainSlider = document.querySelector(`.sd-slider[data-param="${oscKey}.gain"]`);
    if (gainSlider) {
      gainSlider.value = synthParams[oscKey].gain;
      updateValueDisplay(gainSlider, `${oscKey}.gain`, synthParams[oscKey].gain);
    }
    markCustomPreset();
  });
}

function applyOscToggleState(btn, oscKey, enabled) {
  btn.textContent = enabled ? 'On' : 'Off';
  btn.classList.toggle('enabled', enabled);
  // Dim the whole section when disabled
  const section = btn.closest('.sd-section');
  if (section) section.classList.toggle('osc-disabled', !enabled);
}

// Wire up osc toggles after a preset load to reflect new gain values
function syncOscToggles() {
  ['osc2', 'osc3'].forEach(oscKey => {
    const btnId = oscKey + 'Toggle';
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const enabled = synthParams[oscKey].gain > 0;
    if (enabled) oscSavedGain[oscKey] = synthParams[oscKey].gain;
    applyOscToggleState(btn, oscKey, enabled);
  });
}

// Wire up all sliders and selects to synthParams
function initDesignerControls() {
  document.querySelectorAll('.sd-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const path = slider.dataset.param;
      const val = parseFloat(slider.value);
      setSynthParam(path, val);
      updateValueDisplay(slider, path, val);
      markCustomPreset();
    });
  });

  document.querySelectorAll('.sd-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const path = sel.dataset.param;
      setSynthParam(path, sel.value);
      markCustomPreset();
    });
  });

  // OSC 2 / OSC 3 enable toggles
  setupOscToggle('osc2Toggle', 'osc2');
  setupOscToggle('osc3Toggle', 'osc3');
}

function setSynthParam(path, value) {
  const parts = path.split('.');
  if (parts.length === 2) {
    synthParams[parts[0]][parts[1]] = value;
  } else if (parts.length === 1) {
    synthParams[parts[0]] = value;
  }
}

function getSynthParam(path) {
  const parts = path.split('.');
  if (parts.length === 2) return synthParams[parts[0]][parts[1]];
  return synthParams[parts[0]];
}

function updateValueDisplay(slider, path, val) {
  const display = slider.parentElement.querySelector('.sd-value');
  if (!display) return;

  // Format based on param type
  if (path.includes('attack') || path.includes('decay') || path.includes('release')) {
    display.textContent = val >= 1 ? val.toFixed(1) + 's' : Math.round(val * 1000) + 'ms';
  } else if (path === 'pitchBend') {
    display.textContent = val + ' st';
  } else if (path === 'vibratoRate' || path === 'filterLfo.rate') {
    display.textContent = val.toFixed(1) + ' Hz';
  } else if (path === 'vibratoDepth') {
    display.textContent = Math.round(val) + ' ct';
  } else if (path.includes('cutoff') || path.includes('envAmount') || path === 'filterLfo.depth') {
    display.textContent = Math.round(val);
  } else if (path.includes('resonance')) {
    display.textContent = val.toFixed(1);
  } else if (path.includes('octave') && !path.includes('Oct')) {
    display.textContent = val > 0 ? '+' + val : val;
  } else if (path.includes('detune')) {
    display.textContent = val > 0 ? '+' + val : val;
  } else {
    display.textContent = val.toFixed(2);
  }
}

// Sync UI controls to current synthParams (after preset load)
function syncDesignerUI() {
  document.querySelectorAll('.sd-slider').forEach(slider => {
    const path = slider.dataset.param;
    const val = getSynthParam(path);
    slider.value = val;
    updateValueDisplay(slider, path, val);
  });

  document.querySelectorAll('.sd-select').forEach(sel => {
    const path = sel.dataset.param;
    sel.value = getSynthParam(path);
  });

  syncOscToggles();
}

function markCustomPreset() {
  currentPresetName = 'Custom';
  syncPresetDropdown();
}

// ============================================
// EXPORT / IMPORT PATCHES
// ============================================
document.getElementById('sdExport').addEventListener('click', () => {
  const patch = exportPatch();
  patch._presetName = currentPresetName;
  patch._effects = JSON.parse(JSON.stringify(effects));
  // Export readable text version
  const text = formatPatchReadable(patch);
  const textBlob = new Blob([text], { type: 'text/plain' });
  downloadBlob(textBlob, 'keys-synth-settings.txt');
  // Also export JSON for reimport
  const json = JSON.stringify(patch, null, 2);
  const jsonBlob = new Blob([json], { type: 'application/json' });
  downloadBlob(jsonBlob, 'keys-synth-settings.json');
});

document.getElementById('sdImport').addEventListener('click', () => {
  document.getElementById('patchFileInput').click();
});

document.getElementById('patchFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const patch = JSON.parse(reader.result);
      importPatch(patch);
      syncDesignerUI();
      markCustomPreset();
    } catch (err) {
      console.error('Invalid patch file:', err);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('sdRandomize').addEventListener('click', () => {
  randomizePatch();
  syncDesignerUI();
  markCustomPreset();
});

// ============================================
// BUILD PIANO KEYBOARD
// ============================================
function buildPiano() {
  Object.keys(activeNotes).forEach(id => { stopNote(activeNotes[id]); delete activeNotes[id]; });
  releaseSustainedNotes();
  // Also release any MIDI hardware notes
  Object.keys(activeMidiHwNotes).forEach(midi => {
    stopNote(activeMidiHwNotes[midi]);
    delete activeMidiHwNotes[midi];
  });

  pianoEl.innerHTML = '';

  if (currentLayout === 'full88') {
    buildFull88Piano();
  } else {
    buildMappedPiano();
  }

  // Update layout button states
  layoutStdBtn.classList.toggle('active', currentLayout === 'standard');
  layoutExtBtn.classList.toggle('active', currentLayout === 'extended');
  layoutFullBtn.classList.toggle('active', currentLayout === 'full88');

  // Preserve label visibility state
  pianoEl.classList.toggle('hide-labels', !showLabels);
}

function buildMappedPiano() {
  const layout = LAYOUTS[currentLayout];
  const keyMap = layout.map;

  const isExtended = currentLayout === 'extended';
  const isMobileViewport = window.innerWidth < 600;

  // On mobile, fit all keys within the viewport width
  let whiteW, whiteH, blackW, blackH;
  if (isMobileViewport) {
    const whiteKeyCount = keyMap.filter(k => !k.black).length;
    const availableWidth = Math.min(window.innerWidth - 32, 520);
    whiteW = Math.max(Math.floor((availableWidth - (whiteKeyCount - 1) * 2) / whiteKeyCount), 22);
    whiteH = Math.round(whiteW * 4.2);
    blackW = Math.round(whiteW * 0.62);
    blackH = Math.round(whiteH * 0.62);
  } else {
    whiteW = isExtended ? 38 : 52;
    whiteH = isExtended ? 200 : 220;
    blackW = isExtended ? 26 : 34;
    blackH = isExtended ? 125 : 140;
  }
  const gap = 2;

  pianoEl.style.height = whiteH + 'px';
  pianoEl.style.overflowX = '';
  pianoEl.style.overflowY = '';
  pianoEl.classList.remove('full88-scroll');
  const whiteKeys = keyMap.filter(k => !k.black);
  pianoEl.style.width = (whiteKeys.length * (whiteW + gap) - gap) + 'px';

  whiteKeys.forEach((km) => {
    const el = document.createElement('div');
    el.className = 'key';
    el.dataset.key = km.key;
    el.dataset.note = km.note;
    el.dataset.octOffset = km.octOffset;
    const oct = currentOctave + km.octOffset;
    el.innerHTML = `<span class="note-name">${km.note}${oct}</span><span class="label">${displayLabel(km.key)}</span>`;
    el.style.width = whiteW + 'px';
    el.style.height = whiteH + 'px';
    el.style.position = 'relative';
    pianoEl.appendChild(el);
  });

  let wIdx = 0;
  keyMap.forEach((km) => {
    if (km.black) {
      const el = document.createElement('div');
      el.className = 'key black';
      el.dataset.key = km.key;
      el.dataset.note = km.note;
      el.dataset.octOffset = km.octOffset;
      const oct = currentOctave + km.octOffset;
      el.innerHTML = `<span class="note-name">${km.note}${oct}</span><span class="label">${displayLabel(km.key)}</span>`;
      el.style.width = blackW + 'px';
      el.style.height = blackH + 'px';
      el.style.left = (wIdx * (whiteW + gap) - blackW / 2 - 1) + 'px';
      pianoEl.appendChild(el);
    } else {
      wIdx++;
    }
  });

  pianoEl.querySelectorAll('.key').forEach(el => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const km = keyMap.find(m => m.key === el.dataset.key);
      if (km) pressKey(km);
      // Track which key this pointer is currently on
      el._activePointerKm = km;
    });
    el.addEventListener('pointerup', (e) => {
      const km = el._activePointerKm;
      if (km) releaseKey(km);
      el._activePointerKm = null;
    });
    el.addEventListener('pointercancel', (e) => {
      const km = el._activePointerKm;
      if (km) releaseKey(km);
      el._activePointerKm = null;
    });
    el.addEventListener('lostpointercapture', (e) => {
      const km = el._activePointerKm;
      if (km) releaseKey(km);
      el._activePointerKm = null;
    });
    el.addEventListener('pointermove', (e) => {
      // Slide between keys: find which key is now under this pointer
      if (!el.hasPointerCapture(e.pointerId)) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const newEl = target && target.closest('.key[data-key]');
      if (!newEl || newEl === el) return;
      // Release old key
      const oldKm = el._activePointerKm;
      if (oldKm) releaseKey(oldKm);
      el._activePointerKm = null;
      el.releasePointerCapture(e.pointerId);
      // Press new key and transfer capture
      const newKm = keyMap.find(m => m.key === newEl.dataset.key);
      if (newKm) {
        newEl.setPointerCapture(e.pointerId);
        pressKey(newKm);
        newEl._activePointerKm = newKm;
      }
    });
  });

  octControls.style.display = 'flex';
  const isMobile = window.matchMedia('(pointer: coarse)').matches;
  hintEl.textContent = isMobile ? layout.desc + ' • Tap & slide to play' : layout.desc + ' • Space = Sustain';
}

function buildFull88Piano() {
  const whiteW = 16;
  const whiteH = 160;
  const blackW = 11;
  const blackH = 100;
  const gap = 1;

  const whiteKeys88 = FULL_88_KEYS.filter(k => !k.black);
  const totalWidth = whiteKeys88.length * (whiteW + gap) - gap;

  pianoEl.style.height = whiteH + 'px';
  pianoEl.style.width = totalWidth + 'px';
  pianoEl.classList.add('full88-scroll');

  // Build white keys
  whiteKeys88.forEach((k) => {
    const el = document.createElement('div');
    el.className = 'key';
    el.dataset.midi = k.midi;
    el.dataset.note = k.note;
    el.dataset.octave = k.octave;
    // Only show C note names as landmarks
    const showName = k.note === 'C';
    el.innerHTML = `<span class="note-name">${showName ? 'C' + k.octave : ''}</span>`;
    el.style.width = whiteW + 'px';
    el.style.height = whiteH + 'px';
    el.style.position = 'relative';
    el.style.fontSize = '0.45rem';
    pianoEl.appendChild(el);
  });

  // Build black keys
  let wIdx = 0;
  FULL_88_KEYS.forEach((k) => {
    if (k.black) {
      const el = document.createElement('div');
      el.className = 'key black';
      el.dataset.midi = k.midi;
      el.dataset.note = k.note;
      el.dataset.octave = k.octave;
      el.style.width = blackW + 'px';
      el.style.height = blackH + 'px';
      el.style.left = (wIdx * (whiteW + gap) - blackW / 2 - 1) + 'px';
      pianoEl.appendChild(el);
    } else {
      wIdx++;
    }
  });

  // Pointer interaction for full 88 (handles mouse + touch + stylus)
  pianoEl.querySelectorAll('.key').forEach(el => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const midi = parseInt(el.dataset.midi);
      pressFullKey(midi, el);
      el._activeMidi = midi;
    });
    el.addEventListener('pointerup', (e) => {
      if (el._activeMidi != null) releaseFullKey(el._activeMidi, el);
      el._activeMidi = null;
    });
    el.addEventListener('pointercancel', (e) => {
      if (el._activeMidi != null) releaseFullKey(el._activeMidi, el);
      el._activeMidi = null;
    });
    el.addEventListener('lostpointercapture', (e) => {
      if (el._activeMidi != null) releaseFullKey(el._activeMidi, el);
      el._activeMidi = null;
    });
    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const newEl = target && target.closest('.key[data-midi]');
      if (!newEl || newEl === el) return;
      // Slide: release old, press new
      if (el._activeMidi != null) releaseFullKey(el._activeMidi, el);
      el._activeMidi = null;
      el.releasePointerCapture(e.pointerId);
      const newMidi = parseInt(newEl.dataset.midi);
      newEl.setPointerCapture(e.pointerId);
      pressFullKey(newMidi, newEl);
      newEl._activeMidi = newMidi;
    });
  });

  octControls.style.display = 'none';
  const isMobile88 = window.matchMedia('(pointer: coarse)').matches;
  hintEl.textContent = isMobile88 ? 'Full 88 keys • Tap & slide to play' : 'Full 88 keys • Click or use MIDI keyboard • Space = Sustain';

  // Scroll to middle C (C4) area
  const pianoBody = pianoEl.closest('.piano-body');
  if (pianoBody) {
    setTimeout(() => {
      // C4 is roughly key 40 out of 52 white keys
      const c4Pos = 39 * (whiteW + gap);
      const scrollTo = c4Pos - pianoBody.clientWidth / 2;
      pianoBody.scrollLeft = Math.max(0, scrollTo);
    }, 50);
  }
}

// Full 88 key press/release (uses MIDI numbers as IDs)
function pressFullKey(midi, el) {
  const id = 'full_' + midi;
  if (activeMidiHwNotes[id]) return;
  resumeAudio();

  const { note, octave } = midiToNoteName(midi);
  const freq = noteFreq(note, octave);

  // --- Arpeggiator routing ---
  if (typeof arpState !== 'undefined' && arpState.on) {
    arpAddNote(freq, id, note, octave);
    activeMidiHwNotes[id] = { arp: true };
  } else {
    activeMidiHwNotes[id] = playNote(freq);
    if (typeof recordMidiNoteOn === 'function') recordMidiNoteOn(id, note, octave);
  }

  if (el) { el.classList.add('active'); el.classList.remove('sustained'); }
  spawnParticle(midi - 21, 88);
}

function releaseFullKey(midi, el) {
  const id = 'full_' + midi;
  if (!activeMidiHwNotes[id]) return;

  // --- Arpeggiator routing ---
  if (activeMidiHwNotes[id] && activeMidiHwNotes[id].arp) {
    arpRemoveNote(id);
    delete activeMidiHwNotes[id];
    if (el) { el.classList.remove('active'); el.classList.remove('sustained'); }
    return;
  }

  if (sustain) {
    if (sustainedNotes[id]) stopNote(sustainedNotes[id]);
    sustainedNotes[id] = activeMidiHwNotes[id];
    delete activeMidiHwNotes[id];
    if (el) { el.classList.remove('active'); el.classList.add('sustained'); }
  } else {
    if (typeof recordMidiNoteOff === 'function') recordMidiNoteOff(id);
    stopNote(activeMidiHwNotes[id]);
    delete activeMidiHwNotes[id];
    if (el) { el.classList.remove('active'); el.classList.remove('sustained'); }
  }
}

function displayLabel(key) {
  const labels = { ';': ';', ',': ',', '.': '.', '/': '/' };
  return labels[key] || key.toUpperCase();
}

function updateLabels() {
  pianoEl.querySelectorAll('.key').forEach(el => {
    const note = el.dataset.note;
    const oct = currentOctave + parseInt(el.dataset.octOffset);
    el.querySelector('.note-name').textContent = note + oct;
  });
  if (octDisplay) octDisplay.textContent = currentOctave;
}

// ============================================
// PARTICLES
// ============================================
function spawnParticle(keyIndex, total) {
  const p = document.createElement('div');
  p.className = 'note-particle';
  const x = (keyIndex / total) * 100;
  const hue = (keyIndex / total) * 40 + 20;
  p.style.left = x + '%';
  p.style.height = (20 + Math.random() * 40) + 'px';
  p.style.background = `hsla(${hue}, 60%, 60%, 0.7)`;
  vizEl.appendChild(p);
  setTimeout(() => p.remove(), 1500);
}

// ============================================
// NOTE HANDLING
// ============================================
function pressKey(km) {
  const id = km.key;
  if (activeNotes[id]) return;
  resumeAudio();

  const oct = currentOctave + km.octOffset;
  const freq = noteFreq(km.note, oct);

  // --- Arpeggiator routing ---
  if (typeof arpState !== 'undefined' && arpState.on) {
    // Feed note to arpeggiator instead of playing directly
    arpAddNote(freq, id, km.note, oct);
    activeNotes[id] = { arp: true }; // placeholder so we know this key is held
  } else {
    activeNotes[id] = playNote(freq);
    // Record MIDI note-on
    if (typeof recordMidiNoteOn === 'function') recordMidiNoteOn(id, km.note, oct);
  }

  const el = pianoEl.querySelector(`.key[data-key="${CSS.escape(km.key)}"]`);
  if (el) { el.classList.add('active'); el.classList.remove('sustained'); }

  const layout = LAYOUTS[currentLayout];
  spawnParticle(layout.map.indexOf(km), layout.map.length);
}

function releaseKey(km) {
  const id = km.key;
  if (!activeNotes[id]) return;
  const el = pianoEl.querySelector(`.key[data-key="${CSS.escape(km.key)}"]`);

  // --- Arpeggiator routing ---
  if (activeNotes[id] && activeNotes[id].arp) {
    arpRemoveNote(id);
    delete activeNotes[id];
    if (el) { el.classList.remove('active'); el.classList.remove('sustained'); }
    return;
  }

  if (sustain) {
    // Stop any previously sustained instance of this note to prevent orphaned sounds
    if (sustainedNotes[id]) stopNote(sustainedNotes[id]);
    sustainedNotes[id] = activeNotes[id];
    delete activeNotes[id];
    if (el) { el.classList.remove('active'); el.classList.add('sustained'); }
  } else {
    // Record MIDI note-off
    if (typeof recordMidiNoteOff === 'function') recordMidiNoteOff(id);
    stopNote(activeNotes[id]);
    delete activeNotes[id];
    if (el) { el.classList.remove('active'); el.classList.remove('sustained'); }
  }
}

function releaseSustainedNotes() {
  Object.keys(sustainedNotes).forEach(id => {
    // Record MIDI note-off for sustained notes
    if (typeof recordMidiNoteOff === 'function') recordMidiNoteOff(id);
    stopNote(sustainedNotes[id]);

    // Find element — could be data-key (keyboard), data-midi (full88/midi hw)
    let el = pianoEl.querySelector(`.key[data-key="${CSS.escape(id)}"]`);
    if (!el) {
      // Try midi number for full88 clicks and MIDI hw
      const midiNum = id.replace('full_', '').replace('midi_', '');
      el = pianoEl.querySelector(`.key[data-midi="${midiNum}"]`);
    }
    if (el) el.classList.remove('sustained');
  });
  Object.keys(sustainedNotes).forEach(k => delete sustainedNotes[k]);
}

// ============================================
// KEYBOARD LISTENERS
// ============================================
document.addEventListener('keydown', (e) => {
  // Don't capture keys when focused on sound designer controls
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.repeat) return;

  const k = e.key.toLowerCase();
  const layout = LAYOUTS[currentLayout];
  const special = layout.special;

  if (k === special.sustain) { e.preventDefault(); sustain = true; sustainBtn.classList.add('active'); sustainBtn.textContent = 'Sustain: On'; return; }
  if (special.octaveDown && k === special.octaveDown) { currentOctave = Math.max(1, currentOctave - 1); updateLabels(); return; }
  if (special.octaveUp && k === special.octaveUp) { currentOctave = Math.min(7, currentOctave + 1); updateLabels(); return; }

  // Arrow keys for transpose
  if (e.key === 'ArrowUp') { e.preventDefault(); transposeOffset = Math.min(12, transposeOffset + 1); updateTransposeDisplay(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); transposeOffset = Math.max(-12, transposeOffset - 1); updateTransposeDisplay(); return; }

  const km = layout.map.find(m => m.key === k);
  if (km) { e.preventDefault(); pressKey(km); }
});

document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  const layout = LAYOUTS[currentLayout];

  if (k === layout.special.sustain) { sustain = false; sustainBtn.classList.remove('active'); sustainBtn.textContent = 'Sustain: Off'; releaseSustainedNotes(); return; }

  const km = layout.map.find(m => m.key === k);
  if (km) releaseKey(km);
});

// ============================================
// UI CONTROL WIRING
// ============================================
document.getElementById('octDown').addEventListener('click', () => { currentOctave = Math.max(1, currentOctave - 1); updateLabels(); });
document.getElementById('octUp').addEventListener('click', () => { currentOctave = Math.min(7, currentOctave + 1); updateLabels(); });
sustainBtn.addEventListener('click', () => { sustain = !sustain; sustainBtn.classList.toggle('active', sustain); sustainBtn.textContent = sustain ? 'Sustain: On' : 'Sustain: Off'; if (!sustain) releaseSustainedNotes(); });

// Transpose controls
document.getElementById('transDown').addEventListener('click', () => {
  transposeOffset = Math.max(-12, transposeOffset - 1);
  updateTransposeDisplay();
});
document.getElementById('transUp').addEventListener('click', () => {
  transposeOffset = Math.min(12, transposeOffset + 1);
  updateTransposeDisplay();
});

function updateTransposeDisplay() {
  const val = transposeOffset;
  transDisplay.textContent = val > 0 ? '+' + val : val;
  transDisplay.classList.toggle('shifted', val !== 0);
}

// Labels toggle
labelsBtn.addEventListener('click', () => {
  showLabels = !showLabels;
  labelsBtn.classList.toggle('active', showLabels);
  pianoEl.classList.toggle('hide-labels', !showLabels);
});

layoutStdBtn.addEventListener('click', () => { if (currentLayout === 'standard') return; currentLayout = 'standard'; currentOctave = 4; buildPiano(); });
layoutExtBtn.addEventListener('click', () => { if (currentLayout === 'extended') return; currentLayout = 'extended'; currentOctave = 3; buildPiano(); });
layoutFullBtn.addEventListener('click', () => { if (currentLayout === 'full88') return; currentLayout = 'full88'; buildPiano(); });

document.querySelectorAll('.fx-btn').forEach(btn => {
  // Skip the arp toggle — it's handled separately
  if (btn.id === 'arpToggleBtn') return;
  btn.addEventListener('click', () => { btn.classList.toggle('active', toggleEffect(btn.dataset.fx)); });
});

// ============================================
// ARPEGGIATOR UI
// ============================================
const arpToggleBtn = document.getElementById('arpToggleBtn');
const arpPanel = document.getElementById('arpPanel');
const arpPatternSel = document.getElementById('arpPattern');
const arpRateSel = document.getElementById('arpRate');
const arpOctavesSel = document.getElementById('arpOctaves');
const arpGateSlider = document.getElementById('arpGate');

arpToggleBtn.addEventListener('click', () => {
  const nowOn = !arpState.on;
  arpToggle(nowOn);
  arpToggleBtn.classList.toggle('active', nowOn);
  arpPanel.classList.toggle('open', nowOn);
});

arpPatternSel.addEventListener('change', () => arpSetPattern(arpPatternSel.value));
arpRateSel.addEventListener('change', () => arpSetRate(arpRateSel.value));
arpOctavesSel.addEventListener('change', () => arpSetOctaves(parseInt(arpOctavesSel.value)));
arpGateSlider.addEventListener('input', () => arpSetGate(parseInt(arpGateSlider.value) / 100));

// ============================================
// WAVEFORM / SPECTRUM VISUALIZER
// ============================================
let vizMode = 'waveform'; // 'waveform' or 'spectrum'
let vizAnimFrame = null;

function initVisualizer() {
  if (!vizCanvas) return;
  const ctx = vizCanvas.getContext('2d');
  const bufferLength = analyser.frequencyBinCount;
  const waveData = new Uint8Array(bufferLength);
  const freqData = new Uint8Array(bufferLength);

  function resizeCanvas() {
    const rect = vizCanvas.parentElement.getBoundingClientRect();
    vizCanvas.width = rect.width * (window.devicePixelRatio || 1);
    vizCanvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function drawFrame() {
    vizAnimFrame = requestAnimationFrame(drawFrame);

    const w = vizCanvas.width / (window.devicePixelRatio || 1);
    const h = vizCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    // --- Draw frequency spectrum bars (bottom layer) ---
    analyser.getByteFrequencyData(freqData);
    const barCount = 64;
    const barW = w / barCount;
    const usableBins = Math.floor(bufferLength * 0.4); // focus on lower freqs

    for (let i = 0; i < barCount; i++) {
      // Map bar index to frequency bin (logarithmic scale for better spread)
      const logIdx = Math.pow(i / barCount, 1.8) * usableBins;
      const binIdx = Math.min(Math.floor(logIdx), usableBins - 1);
      const val = freqData[binIdx] / 255;

      if (val < 0.02) continue;

      const barH = val * h * 0.7;
      const hue = 25 + (i / barCount) * 25; // warm gold range
      const alpha = 0.08 + val * 0.18;

      ctx.fillStyle = `hsla(${hue}, 50%, 55%, ${alpha})`;
      ctx.fillRect(i * barW, h - barH, barW - 1, barH);
    }

    // --- Draw waveform line (top layer) ---
    analyser.getByteTimeDomainData(waveData);

    ctx.beginPath();
    ctx.lineWidth = 1.5;

    // Check if there's any actual signal
    let hasSignal = false;
    for (let i = 0; i < bufferLength; i++) {
      if (Math.abs(waveData[i] - 128) > 2) { hasSignal = true; break; }
    }

    if (hasSignal) {
      const sliceWidth = w / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = waveData[i] / 128.0;
        const y = (v * h) / 2;
        const deviation = Math.abs(v - 1);
        // Color shifts with amplitude — subtle warm glow
        const hue = 35 + deviation * 40;
        const alpha = 0.25 + deviation * 0.6;

        if (i === 0) {
          ctx.moveTo(x, y);
          ctx.strokeStyle = `hsla(${hue}, 55%, 65%, ${alpha})`;
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      // Use gradient stroke for the waveform
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(200, 170, 100, 0.15)');
      grad.addColorStop(0.3, 'rgba(220, 180, 120, 0.4)');
      grad.addColorStop(0.5, 'rgba(230, 190, 130, 0.5)');
      grad.addColorStop(0.7, 'rgba(220, 180, 120, 0.4)');
      grad.addColorStop(1, 'rgba(200, 170, 100, 0.15)');
      ctx.strokeStyle = grad;
      ctx.stroke();

      // Subtle glow line on top
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.15;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
    } else {
      // Flat line with subtle pulse when idle
      const pulse = Math.sin(Date.now() * 0.001) * 0.3 + 0.7;
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.strokeStyle = `rgba(200, 170, 100, ${0.06 * pulse})`;
      ctx.stroke();
    }
  }

  drawFrame();
}


// ============================================
// WEB MIDI API — USB KEYBOARD SUPPORT
// ============================================
function initWebMIDI() {
  if (!navigator.requestMIDIAccess) {
    console.log('Web MIDI API not supported in this browser');
    return;
  }

  navigator.requestMIDIAccess({ sysex: false })
    .then(onMIDISuccess)
    .catch(err => console.log('MIDI access denied:', err));
}

function onMIDISuccess(access) {
  midiAccess = access;

  // Listen for connection changes
  midiAccess.onstatechange = onMIDIStateChange;

  // Connect to any already-connected inputs
  for (const input of midiAccess.inputs.values()) {
    connectMIDIInput(input);
  }
}

function onMIDIStateChange(e) {
  const port = e.port;
  if (port.type !== 'input') return;

  if (port.state === 'connected') {
    connectMIDIInput(port);
  } else if (port.state === 'disconnected') {
    updateMIDIStatus();
  }
}

function connectMIDIInput(input) {
  input.onmidimessage = onMIDIMessage;
  updateMIDIStatus();
}

function updateMIDIStatus() {
  if (!midiStatus || !midiAccess) return;

  const inputs = [];
  for (const input of midiAccess.inputs.values()) {
    if (input.state === 'connected') {
      inputs.push(input.name || 'Unknown Device');
    }
  }

  if (inputs.length > 0) {
    midiDeviceName = inputs[0];
    midiStatus.textContent = '🎹 ' + (inputs.length === 1 ? inputs[0] : inputs.length + ' devices');
    midiStatus.classList.add('connected');
    midiStatus.title = inputs.join(', ');
  } else {
    midiDeviceName = null;
    midiStatus.textContent = 'No MIDI device';
    midiStatus.classList.remove('connected');
    midiStatus.title = '';
  }
}

function onMIDIMessage(e) {
  const [status, note, velocity] = e.data;
  const command = status & 0xF0;

  // Note on
  if (command === 0x90 && velocity > 0) {
    handleMIDINoteOn(note, velocity);
  }
  // Note off (or note on with velocity 0)
  else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    handleMIDINoteOff(note);
  }
  // Sustain pedal (CC 64)
  else if (command === 0xB0 && note === 64) {
    const pedalDown = velocity >= 64;
    if (pedalDown && !sustain) {
      sustain = true;
      sustainBtn.classList.add('active');
      sustainBtn.textContent = 'Sustain: On';
    } else if (!pedalDown && sustain) {
      sustain = false;
      sustainBtn.classList.remove('active');
      sustainBtn.textContent = 'Sustain: Off';
      releaseSustainedNotes();
    }
  }
}

function handleMIDINoteOn(midiNote, velocity) {
  const id = 'midi_' + midiNote;
  if (activeMidiHwNotes[id]) return;
  resumeAudio();

  const { note, octave } = midiToNoteName(midiNote);
  const freq = noteFreq(note, octave);

  // --- Arpeggiator routing ---
  if (typeof arpState !== 'undefined' && arpState.on) {
    arpAddNote(freq, id, note, octave);
    activeMidiHwNotes[id] = { arp: true };
  } else {
    activeMidiHwNotes[id] = playNote(freq, velocity);
    if (typeof recordMidiNoteOn === 'function') recordMidiNoteOn(id, note, octave);
  }

  // Visual feedback — highlight on-screen key if visible
  highlightMidiKey(midiNote, true);
  spawnParticle(midiNote - 21, 88);
}

function handleMIDINoteOff(midiNote) {
  const id = 'midi_' + midiNote;
  if (!activeMidiHwNotes[id]) return;

  // --- Arpeggiator routing ---
  if (activeMidiHwNotes[id] && activeMidiHwNotes[id].arp) {
    arpRemoveNote(id);
    delete activeMidiHwNotes[id];
    highlightMidiKey(midiNote, false, false);
    return;
  }

  if (sustain) {
    // Stop any previously sustained instance of this note to prevent orphaned sounds
    if (sustainedNotes[id]) stopNote(sustainedNotes[id]);
    sustainedNotes[id] = activeMidiHwNotes[id];
    delete activeMidiHwNotes[id];
    highlightMidiKey(midiNote, false, true);
  } else {
    if (typeof recordMidiNoteOff === 'function') recordMidiNoteOff(id);
    stopNote(activeMidiHwNotes[id]);
    delete activeMidiHwNotes[id];
    highlightMidiKey(midiNote, false, false);
  }
}

function highlightMidiKey(midiNote, pressed, sustained) {
  // In full88 layout, find by data-midi
  let el = pianoEl.querySelector(`.key[data-midi="${midiNote}"]`);

  // In standard/extended layout, find by matching note + octave
  if (!el) {
    const { note, octave } = midiToNoteName(midiNote);
    pianoEl.querySelectorAll('.key').forEach(keyEl => {
      const keyNote = keyEl.dataset.note;
      const keyOct = currentOctave + parseInt(keyEl.dataset.octOffset || 0);
      if (keyNote === note && keyOct === octave) el = keyEl;
    });
  }

  if (!el) return;

  if (pressed) {
    el.classList.add('active');
    el.classList.remove('sustained');
  } else if (sustained) {
    el.classList.remove('active');
    el.classList.add('sustained');
  } else {
    el.classList.remove('active');
    el.classList.remove('sustained');
  }
}

// ============================================
// RESPONSIVE RESIZE
// ============================================
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (currentLayout !== 'full88') buildPiano();
  }, 150);
});

// ============================================
// INIT
// ============================================
buildPresetBar();
initDesignerControls();
syncDesignerUI();
buildPiano();
if (typeof initStudioUI === 'function') initStudioUI();
initWebMIDI();
initVisualizer();
