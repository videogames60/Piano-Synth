// ============================================
// audio.js — Synth engine, presets & effects
// ============================================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// =====================
// NOTE HELPERS
// =====================
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Global transpose offset in semitones (-12 to +12)
let transposeOffset = 0;

function noteFreq(note, octave) {
  const semitone = NOTE_NAMES.indexOf(note);
  const midi = (octave + 1) * 12 + semitone + transposeOffset;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// =====================
// SYNTH VOICE PARAMS
// =====================
// This is the "instrument" — everything that shapes the raw sound.
// Each param can be tweaked by the sound designer panel.

const synthParams = {
  // Oscillator 1
  osc1: { type: 'triangle', gain: 0.8, detune: 0, octave: 0 },
  // Oscillator 2
  osc2: { type: 'sine', gain: 0.2, detune: 3, octave: 1 },
  // Oscillator 3 (sub oscillator — optional, gain 0 = off)
  osc3: { type: 'sine', gain: 0, detune: 0, octave: -1 },
  // Noise oscillator (gain 0 = off)
  noise: { type: 'white', gain: 0 },

  // Filter
  filter: { type: 'lowpass', cutoff: 4000, resonance: 1, envAmount: 0 },

  // Amplitude envelope (ADSR) — times in seconds
  env: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3 },

  // Filter envelope — modulates cutoff
  filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4 },

  // Filter LFO (auto-wah / wobble)
  filterLfo: { rate: 0, depth: 0, type: 'sine' },

  // Global
  masterGainVal: 0.35,
  pitchBend: 0,       // semitones offset (-12 to +12)
  glide: 0,           // portamento time in seconds (0 = off)
  vibratoRate: 0,     // Hz (0 = off)
  vibratoDepth: 0,    // cents
};

// =====================
// PRESETS
// =====================
const PRESETS = {
  'Piano': {
    osc1: { type: 'triangle', gain: 0.8, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 3, octave: 1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 1, envAmount: 800 },
    env: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.4 },
    filterEnv: { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Organ': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0.25, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 6000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.02, decay: 0.05, sustain: 0.9, release: 0.08 },
    filterEnv: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 5.5, vibratoDepth: 8,
  },
  'Electric Piano': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'triangle', gain: 0.25, detune: 5, octave: 1 },
    osc3: { type: 'sine', gain: 0.15, detune: -3, octave: 2 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 3500, resonance: 1.5, envAmount: 1200 },
    env: { attack: 0.003, decay: 0.5, sustain: 0.15, release: 0.6 },
    filterEnv: { attack: 0.003, decay: 0.6, sustain: 0.05, release: 0.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Guitar': {
    osc1: { type: 'sawtooth', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.15, detune: -5, octave: 0 },
    osc3: { type: 'triangle', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'white', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 2500, resonance: 2.5, envAmount: 2000 },
    env: { attack: 0.002, decay: 0.3, sustain: 0.1, release: 0.35 },
    filterEnv: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Synth Lead': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.4, detune: 7, octave: 0 },
    osc3: { type: 'square', gain: 0.15, detune: -5, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 4, envAmount: 3000 },
    env: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.2 },
    filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.03, vibratoRate: 5, vibratoDepth: 12,
  },
  'Synth Pad': {
    osc1: { type: 'sawtooth', gain: 0.35, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.3, detune: 12, octave: 0 },
    osc3: { type: 'triangle', gain: 0.2, detune: -8, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 1800, resonance: 2, envAmount: 800 },
    env: { attack: 0.6, decay: 0.5, sustain: 0.7, release: 1.2 },
    filterEnv: { attack: 0.8, decay: 0.6, sustain: 0.5, release: 1.0 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.1, vibratoRate: 3, vibratoDepth: 6,
  },
  'Bass': {
    osc1: { type: 'sawtooth', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.3, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0.35, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 800, resonance: 3, envAmount: 1500 },
    env: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.15 },
    filterEnv: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.15 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Wobble Bass': {
    osc1: { type: 'sawtooth', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.3, detune: 3, octave: 0 },
    osc3: { type: 'sine', gain: 0.3, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 600, resonance: 6, envAmount: 1200 },
    env: { attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.15 },
    filterEnv: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2 },
    filterLfo: { rate: 4, depth: 2000, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Strings': {
    osc1: { type: 'sawtooth', gain: 0.3, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.25, detune: 10, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.2, detune: -10, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 0.8, envAmount: 500 },
    env: { attack: 0.4, decay: 0.3, sustain: 0.8, release: 0.6 },
    filterEnv: { attack: 0.5, decay: 0.4, sustain: 0.6, release: 0.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.05, vibratoRate: 5, vibratoDepth: 10,
  },
  'Bells': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 1, octave: 2 },
    osc3: { type: 'sine', gain: 0.2, detune: 0, octave: 3 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 1.5, sustain: 0, release: 1.5 },
    filterEnv: { attack: 0.001, decay: 1.0, sustain: 0, release: 1.0 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Hi-Hat': {
    osc1: { type: 'square', gain: 0.1, detune: 0, octave: 3 },
    osc2: { type: 'square', gain: 0.08, detune: 37, octave: 3 },
    osc3: { type: 'square', gain: 0.06, detune: -23, octave: 3 },
    noise: { type: 'white', gain: 0.7 },
    filter: { type: 'highpass', cutoff: 7000, resonance: 2, envAmount: 0 },
    env: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.06 },
    filterEnv: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Wind': {
    osc1: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.6 },
    filter: { type: 'bandpass', cutoff: 1200, resonance: 3, envAmount: 800 },
    env: { attack: 0.5, decay: 0.3, sustain: 0.6, release: 1.0 },
    filterEnv: { attack: 0.6, decay: 0.5, sustain: 0.4, release: 0.8 },
    filterLfo: { rate: 0.3, depth: 600, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Pluck': {
    osc1: { type: 'sawtooth', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.2, detune: 2, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.04 },
    filter: { type: 'lowpass', cutoff: 5000, resonance: 3, envAmount: 4000 },
    env: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.25 },
    filterEnv: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.15 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Flute': {
    osc1: { type: 'sine', gain: 0.7, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.15, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.06 },
    filter: { type: 'lowpass', cutoff: 6000, resonance: 0.8, envAmount: 1000 },
    env: { attack: 0.08, decay: 0.1, sustain: 0.75, release: 0.3 },
    filterEnv: { attack: 0.1, decay: 0.2, sustain: 0.6, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.02, vibratoRate: 5.5, vibratoDepth: 14,
  },
  'Choir': {
    osc1: { type: 'sine', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.35, detune: 14, octave: 0 },
    osc3: { type: 'sine', gain: 0.25, detune: -9, octave: 1 },
    noise: { type: 'pink', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 2800, resonance: 1.5, envAmount: 400 },
    env: { attack: 0.35, decay: 0.4, sustain: 0.75, release: 0.9 },
    filterEnv: { attack: 0.5, decay: 0.5, sustain: 0.5, release: 0.7 },
    filterLfo: { rate: 4.5, depth: 180, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.08, vibratoRate: 4, vibratoDepth: 9,
  },
  'Kalimba': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.25, detune: 0, octave: 2 },
    osc3: { type: 'triangle', gain: 0.1, detune: 7, octave: 3 },
    noise: { type: 'white', gain: 0.015 },
    filter: { type: 'lowpass', cutoff: 7000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.9 },
    filterEnv: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.6 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.32, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Brass': {
    osc1: { type: 'sawtooth', gain: 0.55, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.3, detune: 4, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.15, detune: -3, octave: 1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 1200, resonance: 3.5, envAmount: 4500 },
    env: { attack: 0.06, decay: 0.15, sustain: 0.7, release: 0.2 },
    filterEnv: { attack: 0.04, decay: 0.2, sustain: 0.5, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 5, vibratoDepth: 7,
  },
  'Theremin': {
    osc1: { type: 'sine', gain: 0.65, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 1, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 5000, resonance: 1, envAmount: 0 },
    env: { attack: 0.18, decay: 0.1, sustain: 0.9, release: 0.5 },
    filterEnv: { attack: 0.2, decay: 0.1, sustain: 0.8, release: 0.4 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.12, vibratoRate: 5, vibratoDepth: 22,
  },
  'FM Bell': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.4, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0.2, detune: 0, octave: 4 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 12000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 1.2, sustain: 0.05, release: 2.0 },
    filterEnv: { attack: 0.001, decay: 0.8, sustain: 0, release: 1.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Acid': {
    osc1: { type: 'sawtooth', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0.2, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 500, resonance: 14, envAmount: 3500 },
    env: { attack: 0.003, decay: 0.25, sustain: 0.1, release: 0.2 },
    filterEnv: { attack: 0.003, decay: 0.22, sustain: 0, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.04, vibratoRate: 0, vibratoDepth: 0,
  },
  'Space': {
    osc1: { type: 'sawtooth', gain: 0.25, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.25, detune: 20, octave: -1 },
    osc3: { type: 'sine', gain: 0.2, detune: -15, octave: 1 },
    noise: { type: 'pink', gain: 0.05 },
    filter: { type: 'lowpass', cutoff: 800, resonance: 5, envAmount: 600 },
    env: { attack: 1.2, decay: 0.8, sustain: 0.6, release: 2.5 },
    filterEnv: { attack: 1.5, decay: 1.0, sustain: 0.4, release: 2.0 },
    filterLfo: { rate: 0.15, depth: 1200, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.2, vibratoRate: 2, vibratoDepth: 18,
  },

  // ========== KEYBOARDS ==========
  'Clavinet': {
    osc1: { type: 'square', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.25, detune: 2, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 4, envAmount: 3500 },
    env: { attack: 0.001, decay: 0.25, sustain: 0.05, release: 0.15 },
    filterEnv: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.12 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.32, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Harpsichord': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.3, detune: 0, octave: 1 },
    osc3: { type: 'sawtooth', gain: 0.15, detune: 1, octave: 2 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 4500, resonance: 2, envAmount: 2000 },
    env: { attack: 0.001, decay: 0.4, sustain: 0.02, release: 0.3 },
    filterEnv: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Wurlitzer': {
    osc1: { type: 'sine', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'triangle', gain: 0.2, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0.1, detune: 5, octave: 2 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 2800, resonance: 2, envAmount: 1800 },
    env: { attack: 0.002, decay: 0.6, sustain: 0.1, release: 0.5 },
    filterEnv: { attack: 0.002, decay: 0.5, sustain: 0.05, release: 0.4 },
    filterLfo: { rate: 5.2, depth: 120, type: 'sine' },
    masterGainVal: 0.33, pitchBend: 0, glide: 0, vibratoRate: 5.2, vibratoDepth: 6,
  },
  'Honky Tonk': {
    osc1: { type: 'triangle', gain: 0.7, detune: 8, octave: 0 },
    osc2: { type: 'triangle', gain: 0.6, detune: -8, octave: 0 },
    osc3: { type: 'sine', gain: 0.2, detune: 3, octave: 1 },
    noise: { type: 'white', gain: 0.01 },
    filter: { type: 'lowpass', cutoff: 3500, resonance: 1.5, envAmount: 1000 },
    env: { attack: 0.003, decay: 0.35, sustain: 0.2, release: 0.5 },
    filterEnv: { attack: 0.003, decay: 0.4, sustain: 0.1, release: 0.4 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Celesta': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 1 },
    osc2: { type: 'triangle', gain: 0.2, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 3 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 9000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.6, sustain: 0.02, release: 0.8 },
    filterEnv: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Toy Piano': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.01 },
    filter: { type: 'lowpass', cutoff: 5000, resonance: 1, envAmount: 1500 },
    env: { attack: 0.001, decay: 0.3, sustain: 0.05, release: 0.25 },
    filterEnv: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== BASS ==========
  'Sub Bass': {
    osc1: { type: 'sine', gain: 0.8, detune: 0, octave: -1 },
    osc2: { type: 'sine', gain: 0.15, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 400, resonance: 1, envAmount: 200 },
    env: { attack: 0.005, decay: 0.1, sustain: 0.8, release: 0.1 },
    filterEnv: { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.4, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Slap Bass': {
    osc1: { type: 'sawtooth', gain: 0.55, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.3, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0.3, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0.08 },
    filter: { type: 'lowpass', cutoff: 1200, resonance: 5, envAmount: 3500 },
    env: { attack: 0.001, decay: 0.12, sustain: 0.15, release: 0.1 },
    filterEnv: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.08 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Fretless Bass': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'triangle', gain: 0.25, detune: 3, octave: 0 },
    osc3: { type: 'sine', gain: 0.3, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 1500, resonance: 2, envAmount: 800 },
    env: { attack: 0.03, decay: 0.2, sustain: 0.5, release: 0.25 },
    filterEnv: { attack: 0.03, decay: 0.3, sustain: 0.3, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0.06, vibratoRate: 4, vibratoDepth: 8,
  },
  'Acid Bass': {
    osc1: { type: 'sawtooth', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0.25, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 300, resonance: 16, envAmount: 5000 },
    env: { attack: 0.002, decay: 0.15, sustain: 0.05, release: 0.1 },
    filterEnv: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.06, vibratoRate: 0, vibratoDepth: 0,
  },
  'Rubber Bass': {
    osc1: { type: 'sine', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'triangle', gain: 0.3, detune: 0, octave: -1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 600, resonance: 6, envAmount: 2000 },
    env: { attack: 0.003, decay: 0.3, sustain: 0.2, release: 0.2 },
    filterEnv: { attack: 0.003, decay: 0.25, sustain: 0.05, release: 0.15 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0.08, vibratoRate: 0, vibratoDepth: 0,
  },
  'Reese Bass': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 5, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.5, detune: -5, octave: 0 },
    osc3: { type: 'sine', gain: 0.3, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 700, resonance: 3, envAmount: 800 },
    env: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.2 },
    filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.2 },
    filterLfo: { rate: 0.3, depth: 400, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.04, vibratoRate: 0, vibratoDepth: 0,
  },
  'Moog Bass': {
    osc1: { type: 'sawtooth', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.35, detune: -2, octave: 0 },
    osc3: { type: 'sine', gain: 0.3, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 500, resonance: 6, envAmount: 2500 },
    env: { attack: 0.003, decay: 0.2, sustain: 0.4, release: 0.15 },
    filterEnv: { attack: 0.003, decay: 0.18, sustain: 0.1, release: 0.12 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.32, pitchBend: 0, glide: 0.03, vibratoRate: 0, vibratoDepth: 0,
  },
  'FM Bass': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.4, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0.2, detune: 0, octave: 2 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 2000, resonance: 3, envAmount: 2000 },
    env: { attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.12 },
    filterEnv: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Distorted Bass': {
    osc1: { type: 'sawtooth', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.5, detune: 3, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.4, detune: -3, octave: -1 },
    noise: { type: 'white', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 900, resonance: 8, envAmount: 2000 },
    env: { attack: 0.002, decay: 0.15, sustain: 0.5, release: 0.12 },
    filterEnv: { attack: 0.002, decay: 0.1, sustain: 0.2, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== LEADS ==========
  'Square Lead': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.3, detune: 7, octave: 0 },
    osc3: { type: 'sine', gain: 0.15, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 2500, resonance: 3, envAmount: 2500 },
    env: { attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.15 },
    filterEnv: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.02, vibratoRate: 5, vibratoDepth: 10,
  },
  'Screamer Lead': {
    osc1: { type: 'sawtooth', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.5, detune: 10, octave: 0 },
    osc3: { type: 'square', gain: 0.25, detune: -5, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 1500, resonance: 8, envAmount: 5000 },
    env: { attack: 0.005, decay: 0.1, sustain: 0.8, release: 0.15 },
    filterEnv: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.22, pitchBend: 0, glide: 0.04, vibratoRate: 6, vibratoDepth: 15,
  },
  'Portamento Lead': {
    osc1: { type: 'sawtooth', gain: 0.55, detune: 0, octave: 0 },
    osc2: { type: 'triangle', gain: 0.3, detune: 5, octave: 0 },
    osc3: { type: 'sine', gain: 0.15, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 3500, resonance: 3, envAmount: 2000 },
    env: { attack: 0.02, decay: 0.15, sustain: 0.7, release: 0.2 },
    filterEnv: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.15, vibratoRate: 5, vibratoDepth: 12,
  },
  'Sine Lead': {
    osc1: { type: 'sine', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 6000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 },
    filterEnv: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.02, vibratoRate: 5, vibratoDepth: 8,
  },
  'Detuned Lead': {
    osc1: { type: 'sawtooth', gain: 0.45, detune: 12, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.45, detune: -12, octave: 0 },
    osc3: { type: 'square', gain: 0.2, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 3, envAmount: 2000 },
    env: { attack: 0.008, decay: 0.2, sustain: 0.65, release: 0.2 },
    filterEnv: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.25 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.03, vibratoRate: 4.5, vibratoDepth: 8,
  },
  'Trance Lead': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.5, detune: 15, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.3, detune: -10, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 2000, resonance: 5, envAmount: 4000 },
    env: { attack: 0.005, decay: 0.15, sustain: 0.75, release: 0.15 },
    filterEnv: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.22, pitchBend: 0, glide: 0.02, vibratoRate: 0, vibratoDepth: 0,
  },
  'Chip Lead': {
    osc1: { type: 'square', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.08, sustain: 0.6, release: 0.05 },
    filterEnv: { attack: 0.001, decay: 0.05, sustain: 0.5, release: 0.05 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== PADS ==========
  'Warm Pad': {
    osc1: { type: 'sawtooth', gain: 0.3, detune: 5, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.3, detune: -5, octave: 0 },
    osc3: { type: 'triangle', gain: 0.2, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 1200, resonance: 1.5, envAmount: 500 },
    env: { attack: 0.8, decay: 0.5, sustain: 0.75, release: 1.5 },
    filterEnv: { attack: 1.0, decay: 0.6, sustain: 0.6, release: 1.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.1, vibratoRate: 3, vibratoDepth: 5,
  },
  'Glass Pad': {
    osc1: { type: 'sine', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 7, octave: 1 },
    osc3: { type: 'triangle', gain: 0.15, detune: -3, octave: 2 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 2, envAmount: 1000 },
    env: { attack: 0.5, decay: 0.4, sustain: 0.7, release: 1.8 },
    filterEnv: { attack: 0.6, decay: 0.5, sustain: 0.5, release: 1.5 },
    filterLfo: { rate: 0.2, depth: 300, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.08, vibratoRate: 3.5, vibratoDepth: 6,
  },
  'Dark Pad': {
    osc1: { type: 'sawtooth', gain: 0.35, detune: -3, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.35, detune: 3, octave: -1 },
    osc3: { type: 'sine', gain: 0.25, detune: 0, octave: -1 },
    noise: { type: 'pink', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 600, resonance: 3, envAmount: 300 },
    env: { attack: 1.5, decay: 0.8, sustain: 0.6, release: 2.5 },
    filterEnv: { attack: 2.0, decay: 1.0, sustain: 0.4, release: 2.0 },
    filterLfo: { rate: 0.1, depth: 200, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.15, vibratoRate: 2, vibratoDepth: 5,
  },
  'Shimmer Pad': {
    osc1: { type: 'sine', gain: 0.35, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 12, octave: 1 },
    osc3: { type: 'triangle', gain: 0.2, detune: -7, octave: 2 },
    noise: { type: 'white', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 5000, resonance: 2, envAmount: 1500 },
    env: { attack: 1.0, decay: 0.6, sustain: 0.65, release: 2.0 },
    filterEnv: { attack: 1.2, decay: 0.8, sustain: 0.5, release: 1.8 },
    filterLfo: { rate: 0.25, depth: 500, type: 'triangle' },
    masterGainVal: 0.22, pitchBend: 0, glide: 0.1, vibratoRate: 4, vibratoDepth: 8,
  },
  'Ice Pad': {
    osc1: { type: 'sawtooth', gain: 0.2, detune: 20, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.2, detune: -20, octave: 0 },
    osc3: { type: 'sine', gain: 0.15, detune: 0, octave: 1 },
    noise: { type: 'white', gain: 0.06 },
    filter: { type: 'bandpass', cutoff: 3000, resonance: 4, envAmount: 1000 },
    env: { attack: 1.5, decay: 0.5, sustain: 0.5, release: 3.0 },
    filterEnv: { attack: 2.0, decay: 1.0, sustain: 0.3, release: 2.5 },
    filterLfo: { rate: 0.08, depth: 800, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.2, vibratoRate: 2.5, vibratoDepth: 10,
  },
  'Sweep Pad': {
    osc1: { type: 'sawtooth', gain: 0.35, detune: 8, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.35, detune: -8, octave: 0 },
    osc3: { type: 'triangle', gain: 0.15, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 400, resonance: 4, envAmount: 3000 },
    env: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 1.5 },
    filterEnv: { attack: 2.0, decay: 1.5, sustain: 0.6, release: 2.0 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.1, vibratoRate: 3, vibratoDepth: 5,
  },
  'Cathedral Pad': {
    osc1: { type: 'sine', gain: 0.35, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 5, octave: 1 },
    osc3: { type: 'sine', gain: 0.2, detune: -3, octave: -1 },
    noise: { type: 'pink', gain: 0.04 },
    filter: { type: 'lowpass', cutoff: 2500, resonance: 1, envAmount: 800 },
    env: { attack: 2.0, decay: 1.0, sustain: 0.7, release: 3.0 },
    filterEnv: { attack: 2.5, decay: 1.5, sustain: 0.5, release: 2.5 },
    filterLfo: { rate: 0.05, depth: 400, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.15, vibratoRate: 2, vibratoDepth: 4,
  },

  // ========== STRINGS & ORCHESTRA ==========
  'Cello': {
    osc1: { type: 'sawtooth', gain: 0.45, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.3, detune: 5, octave: 0 },
    osc3: { type: 'triangle', gain: 0.15, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0.01 },
    filter: { type: 'lowpass', cutoff: 2000, resonance: 1.5, envAmount: 800 },
    env: { attack: 0.15, decay: 0.2, sustain: 0.8, release: 0.4 },
    filterEnv: { attack: 0.2, decay: 0.3, sustain: 0.6, release: 0.4 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.04, vibratoRate: 5.5, vibratoDepth: 12,
  },
  'Violin': {
    osc1: { type: 'sawtooth', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.25, detune: 3, octave: 0 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'white', gain: 0.015 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 1.5, envAmount: 1000 },
    env: { attack: 0.1, decay: 0.15, sustain: 0.8, release: 0.3 },
    filterEnv: { attack: 0.12, decay: 0.2, sustain: 0.6, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.03, vibratoRate: 6, vibratoDepth: 14,
  },
  'Pizzicato': {
    osc1: { type: 'triangle', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.04 },
    filter: { type: 'lowpass', cutoff: 5000, resonance: 1.5, envAmount: 3000 },
    env: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.15 },
    filterEnv: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Harp': {
    osc1: { type: 'triangle', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.25, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 2 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 6000, resonance: 1, envAmount: 1500 },
    env: { attack: 0.001, decay: 0.6, sustain: 0.05, release: 0.8 },
    filterEnv: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.32, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== WIND & BRASS ==========
  'Clarinet': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.15, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 3500, resonance: 1.5, envAmount: 800 },
    env: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.2 },
    filterEnv: { attack: 0.06, decay: 0.15, sustain: 0.6, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.02, vibratoRate: 5, vibratoDepth: 10,
  },
  'Oboe': {
    osc1: { type: 'sawtooth', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 2 },
    noise: { type: 'pink', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 2, envAmount: 600 },
    env: { attack: 0.04, decay: 0.1, sustain: 0.75, release: 0.2 },
    filterEnv: { attack: 0.05, decay: 0.15, sustain: 0.5, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.02, vibratoRate: 5.5, vibratoDepth: 11,
  },
  'Trumpet': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.25, detune: 2, octave: 0 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 1500, resonance: 3, envAmount: 4000 },
    env: { attack: 0.04, decay: 0.1, sustain: 0.75, release: 0.15 },
    filterEnv: { attack: 0.03, decay: 0.15, sustain: 0.5, release: 0.15 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 5.5, vibratoDepth: 8,
  },
  'Trombone': {
    osc1: { type: 'sawtooth', gain: 0.55, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.2, detune: 3, octave: 0 },
    osc3: { type: 'sine', gain: 0.15, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 1000, resonance: 3, envAmount: 3500 },
    env: { attack: 0.05, decay: 0.12, sustain: 0.7, release: 0.2 },
    filterEnv: { attack: 0.04, decay: 0.2, sustain: 0.4, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.08, vibratoRate: 5, vibratoDepth: 7,
  },
  'French Horn': {
    osc1: { type: 'sawtooth', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 0 },
    osc3: { type: 'triangle', gain: 0.15, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 800, resonance: 2.5, envAmount: 2500 },
    env: { attack: 0.08, decay: 0.15, sustain: 0.7, release: 0.3 },
    filterEnv: { attack: 0.06, decay: 0.25, sustain: 0.4, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.03, vibratoRate: 4.5, vibratoDepth: 9,
  },
  'Tuba': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.2, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0.3, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 600, resonance: 2, envAmount: 2000 },
    env: { attack: 0.07, decay: 0.15, sustain: 0.65, release: 0.25 },
    filterEnv: { attack: 0.06, decay: 0.2, sustain: 0.35, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.32, pitchBend: 0, glide: 0.02, vibratoRate: 4, vibratoDepth: 6,
  },
  'Pan Flute': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.1, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.1 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 1, envAmount: 500 },
    env: { attack: 0.1, decay: 0.1, sustain: 0.7, release: 0.25 },
    filterEnv: { attack: 0.12, decay: 0.15, sustain: 0.5, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.02, vibratoRate: 4.5, vibratoDepth: 12,
  },
  'Saxophone': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.15, detune: 2, octave: 0 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'pink', gain: 0.04 },
    filter: { type: 'lowpass', cutoff: 2500, resonance: 3, envAmount: 1500 },
    env: { attack: 0.04, decay: 0.1, sustain: 0.75, release: 0.2 },
    filterEnv: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.03, vibratoRate: 5.5, vibratoDepth: 12,
  },
  'Harmonica': {
    osc1: { type: 'square', gain: 0.45, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.2, detune: 3, octave: 0 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'pink', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 2, envAmount: 800 },
    env: { attack: 0.03, decay: 0.08, sustain: 0.8, release: 0.15 },
    filterEnv: { attack: 0.04, decay: 0.12, sustain: 0.6, release: 0.15 },
    filterLfo: { rate: 4, depth: 150, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.01, vibratoRate: 6, vibratoDepth: 15,
  },
  'Accordion': {
    osc1: { type: 'square', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.25, detune: 8, octave: 0 },
    osc3: { type: 'square', gain: 0.15, detune: -5, octave: 1 },
    noise: { type: 'pink', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 3500, resonance: 1.5, envAmount: 500 },
    env: { attack: 0.05, decay: 0.08, sustain: 0.85, release: 0.1 },
    filterEnv: { attack: 0.06, decay: 0.1, sustain: 0.7, release: 0.1 },
    filterLfo: { rate: 5, depth: 120, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 5.5, vibratoDepth: 10,
  },

  // ========== GUITARS ==========
  'Acoustic Guitar': {
    osc1: { type: 'triangle', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.15, detune: -2, octave: 0 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'white', gain: 0.05 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 2, envAmount: 2500 },
    env: { attack: 0.001, decay: 0.4, sustain: 0.08, release: 0.35 },
    filterEnv: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.32, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Electric Guitar Clean': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'triangle', gain: 0.25, detune: 3, octave: 0 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'white', gain: 0.01 },
    filter: { type: 'lowpass', cutoff: 3500, resonance: 2, envAmount: 1500 },
    env: { attack: 0.002, decay: 0.35, sustain: 0.15, release: 0.3 },
    filterEnv: { attack: 0.002, decay: 0.2, sustain: 0.05, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Overdriven Guitar': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.4, detune: 5, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.2, detune: -3, octave: 0 },
    noise: { type: 'white', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 2000, resonance: 4, envAmount: 2500 },
    env: { attack: 0.003, decay: 0.2, sustain: 0.5, release: 0.25 },
    filterEnv: { attack: 0.003, decay: 0.15, sustain: 0.2, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.22, pitchBend: 0, glide: 0, vibratoRate: 5, vibratoDepth: 8,
  },
  'Sitar': {
    osc1: { type: 'sawtooth', gain: 0.45, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.2, detune: 1, octave: 1 },
    osc3: { type: 'sine', gain: 0.15, detune: 7, octave: 2 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 5, envAmount: 3000 },
    env: { attack: 0.001, decay: 0.5, sustain: 0.05, release: 0.6 },
    filterEnv: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.4 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.01, vibratoRate: 6, vibratoDepth: 15,
  },
  'Banjo': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.2, detune: 2, octave: 1 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 2 },
    noise: { type: 'white', gain: 0.04 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 3, envAmount: 3500 },
    env: { attack: 0.001, decay: 0.2, sustain: 0.03, release: 0.2 },
    filterEnv: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.15 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== PERCUSSION ==========
  'Kick Drum': {
    osc1: { type: 'sine', gain: 0.9, detune: 0, octave: -1 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.05 },
    filter: { type: 'lowpass', cutoff: 500, resonance: 1, envAmount: 800 },
    env: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
    filterEnv: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.4, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Snare': {
    osc1: { type: 'triangle', gain: 0.3, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.15, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.6 },
    filter: { type: 'highpass', cutoff: 2000, resonance: 1.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.12 },
    filterEnv: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.08 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Open Hat': {
    osc1: { type: 'square', gain: 0.08, detune: 0, octave: 3 },
    osc2: { type: 'square', gain: 0.06, detune: 45, octave: 3 },
    osc3: { type: 'square', gain: 0.05, detune: -30, octave: 4 },
    noise: { type: 'white', gain: 0.6 },
    filter: { type: 'highpass', cutoff: 6000, resonance: 2.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.35, sustain: 0.05, release: 0.3 },
    filterEnv: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Tom': {
    osc1: { type: 'sine', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 0, octave: 1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.08 },
    filter: { type: 'lowpass', cutoff: 2000, resonance: 1.5, envAmount: 1000 },
    env: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.25 },
    filterEnv: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.12 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Clap': {
    osc1: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.8 },
    filter: { type: 'bandpass', cutoff: 1500, resonance: 3, envAmount: 0 },
    env: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.15 },
    filterEnv: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Cowbell': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 2 },
    osc2: { type: 'square', gain: 0.35, detune: 45, octave: 2 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'bandpass', cutoff: 4000, resonance: 2, envAmount: 0 },
    env: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.15 },
    filterEnv: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Tambourine': {
    osc1: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.7 },
    filter: { type: 'highpass', cutoff: 8000, resonance: 2, envAmount: 0 },
    env: { attack: 0.001, decay: 0.1, sustain: 0.02, release: 0.08 },
    filterEnv: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Bongo': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 1 },
    osc2: { type: 'triangle', gain: 0.2, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.06 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 2, envAmount: 1500 },
    env: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.12 },
    filterEnv: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.06 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== MALLETS ==========
  'Marimba': {
    osc1: { type: 'sine', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.25, detune: 0, octave: 2 },
    osc3: { type: 'triangle', gain: 0.1, detune: 0, octave: 3 },
    noise: { type: 'white', gain: 0.01 },
    filter: { type: 'lowpass', cutoff: 5000, resonance: 1, envAmount: 1000 },
    env: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.6 },
    filterEnv: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.4 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.32, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Vibraphone': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0.15, detune: 0, octave: 3 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 7000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 1.2, sustain: 0.1, release: 1.5 },
    filterEnv: { attack: 0.001, decay: 0.8, sustain: 0, release: 1.0 },
    filterLfo: { rate: 5, depth: 200, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 5, vibratoDepth: 10,
  },
  'Xylophone': {
    osc1: { type: 'sine', gain: 0.55, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 3 },
    osc3: { type: 'triangle', gain: 0.1, detune: 0, octave: 4 },
    noise: { type: 'white', gain: 0.015 },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.35 },
    filterEnv: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Glockenspiel': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 2 },
    osc2: { type: 'sine', gain: 0.25, detune: 0, octave: 3 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 4 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 10000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.8, sustain: 0, release: 1.0 },
    filterEnv: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.6 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Steel Drum': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.35, detune: 7, octave: 2 },
    osc3: { type: 'sine', gain: 0.2, detune: -5, octave: 3 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 6000, resonance: 1, envAmount: 1000 },
    env: { attack: 0.001, decay: 0.6, sustain: 0.02, release: 0.5 },
    filterEnv: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Music Box': {
    osc1: { type: 'sine', gain: 0.5, detune: 0, octave: 2 },
    osc2: { type: 'triangle', gain: 0.15, detune: 0, octave: 3 },
    osc3: { type: 'sine', gain: 0.05, detune: 0, octave: 4 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 1.0, sustain: 0, release: 1.2 },
    filterEnv: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.8 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Tubular Bells': {
    osc1: { type: 'sine', gain: 0.45, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 2 },
    osc3: { type: 'sine', gain: 0.2, detune: 15, octave: 3 },
    noise: { type: 'white', gain: 0.01 },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 0.8, envAmount: 0 },
    env: { attack: 0.001, decay: 2.0, sustain: 0.05, release: 2.5 },
    filterEnv: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== SYNTH TEXTURES & FX ==========
  'Supersaw': {
    osc1: { type: 'sawtooth', gain: 0.35, detune: 15, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.35, detune: -15, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.3, detune: 7, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 1.5, envAmount: 2000 },
    env: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 },
    filterEnv: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.2, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Hoover': {
    osc1: { type: 'sawtooth', gain: 0.4, detune: 10, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.4, detune: -10, octave: 0 },
    osc3: { type: 'square', gain: 0.25, detune: 5, octave: -1 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 1500, resonance: 4, envAmount: 3000 },
    env: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3 },
    filterEnv: { attack: 0.01, decay: 0.4, sustain: 0.3, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.22, pitchBend: 0, glide: 0.08, vibratoRate: 0, vibratoDepth: 0,
  },
  'Stab': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.4, detune: 5, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.3, detune: -3, octave: 1 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 2000, resonance: 5, envAmount: 5000 },
    env: { attack: 0.002, decay: 0.15, sustain: 0.05, release: 0.12 },
    filterEnv: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Laser': {
    osc1: { type: 'sawtooth', gain: 0.6, detune: 0, octave: 2 },
    osc2: { type: 'sine', gain: 0.3, detune: 0, octave: 3 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 8, envAmount: -5000 },
    env: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
    filterEnv: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Sci-Fi': {
    osc1: { type: 'sawtooth', gain: 0.3, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 25, octave: 1 },
    osc3: { type: 'square', gain: 0.15, detune: -20, octave: 2 },
    noise: { type: 'pink', gain: 0.04 },
    filter: { type: 'bandpass', cutoff: 1500, resonance: 6, envAmount: 2000 },
    env: { attack: 0.3, decay: 0.5, sustain: 0.4, release: 1.5 },
    filterEnv: { attack: 0.5, decay: 0.8, sustain: 0.3, release: 1.2 },
    filterLfo: { rate: 0.5, depth: 1500, type: 'triangle' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.15, vibratoRate: 3, vibratoDepth: 20,
  },
  'Robot': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'sawtooth', gain: 0.3, detune: 0, octave: 1 },
    osc3: { type: 'square', gain: 0.2, detune: 0, octave: -1 },
    noise: { type: 'white', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 1200, resonance: 8, envAmount: 2000 },
    env: { attack: 0.001, decay: 0.1, sustain: 0.6, release: 0.05 },
    filterEnv: { attack: 0.001, decay: 0.08, sustain: 0.4, release: 0.05 },
    filterLfo: { rate: 8, depth: 800, type: 'square' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Underwater': {
    osc1: { type: 'sine', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.3, detune: 8, octave: -1 },
    osc3: { type: 'triangle', gain: 0.15, detune: -5, octave: 0 },
    noise: { type: 'pink', gain: 0.06 },
    filter: { type: 'lowpass', cutoff: 600, resonance: 4, envAmount: 400 },
    env: { attack: 0.4, decay: 0.5, sustain: 0.5, release: 1.5 },
    filterEnv: { attack: 0.6, decay: 0.8, sustain: 0.3, release: 1.2 },
    filterLfo: { rate: 0.2, depth: 300, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.12, vibratoRate: 2, vibratoDepth: 6,
  },
  'Crystal': {
    osc1: { type: 'sine', gain: 0.4, detune: 0, octave: 1 },
    osc2: { type: 'sine', gain: 0.3, detune: 5, octave: 2 },
    osc3: { type: 'triangle', gain: 0.15, detune: -3, octave: 3 },
    noise: { type: 'white', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 8000, resonance: 2, envAmount: 2000 },
    env: { attack: 0.001, decay: 0.8, sustain: 0.1, release: 1.5 },
    filterEnv: { attack: 0.001, decay: 0.5, sustain: 0, release: 1.0 },
    filterLfo: { rate: 0.15, depth: 500, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 3, vibratoDepth: 5,
  },
  'Metallic': {
    osc1: { type: 'square', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.35, detune: 37, octave: 1 },
    osc3: { type: 'sine', gain: 0.2, detune: -23, octave: 2 },
    noise: { type: 'white', gain: 0.03 },
    filter: { type: 'bandpass', cutoff: 3000, resonance: 5, envAmount: 2000 },
    env: { attack: 0.001, decay: 0.6, sustain: 0.05, release: 0.8 },
    filterEnv: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.5 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Growl': {
    osc1: { type: 'sawtooth', gain: 0.55, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.35, detune: 3, octave: 0 },
    osc3: { type: 'sawtooth', gain: 0.25, detune: -2, octave: -1 },
    noise: { type: 'white', gain: 0.04 },
    filter: { type: 'lowpass', cutoff: 500, resonance: 10, envAmount: 2500 },
    env: { attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.15 },
    filterEnv: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.15 },
    filterLfo: { rate: 6, depth: 1500, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.03, vibratoRate: 0, vibratoDepth: 0,
  },
  'Noise Sweep': {
    osc1: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.7 },
    filter: { type: 'lowpass', cutoff: 200, resonance: 8, envAmount: 8000 },
    env: { attack: 0.5, decay: 0.8, sustain: 0.3, release: 1.0 },
    filterEnv: { attack: 1.0, decay: 1.5, sustain: 0.1, release: 1.0 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Bit Crusher': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0.4, detune: 50, octave: 0 },
    osc3: { type: 'square', gain: 0.3, detune: -50, octave: 0 },
    noise: { type: 'white', gain: 0.05 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 2, envAmount: 1000 },
    env: { attack: 0.001, decay: 0.1, sustain: 0.5, release: 0.08 },
    filterEnv: { attack: 0.001, decay: 0.08, sustain: 0.3, release: 0.06 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.22, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== AMBIENT & CINEMATIC ==========
  'Drone': {
    osc1: { type: 'sawtooth', gain: 0.25, detune: 3, octave: -1 },
    osc2: { type: 'sawtooth', gain: 0.25, detune: -3, octave: -1 },
    osc3: { type: 'sine', gain: 0.2, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.04 },
    filter: { type: 'lowpass', cutoff: 500, resonance: 2, envAmount: 200 },
    env: { attack: 3.0, decay: 1.0, sustain: 0.8, release: 4.0 },
    filterEnv: { attack: 3.5, decay: 1.5, sustain: 0.6, release: 3.0 },
    filterLfo: { rate: 0.05, depth: 200, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.3, vibratoRate: 1, vibratoDepth: 3,
  },
  'Ethereal': {
    osc1: { type: 'sine', gain: 0.3, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.25, detune: 7, octave: 1 },
    osc3: { type: 'triangle', gain: 0.15, detune: -5, octave: 2 },
    noise: { type: 'pink', gain: 0.05 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 2, envAmount: 1500 },
    env: { attack: 1.5, decay: 0.8, sustain: 0.5, release: 3.0 },
    filterEnv: { attack: 2.0, decay: 1.0, sustain: 0.4, release: 2.5 },
    filterLfo: { rate: 0.1, depth: 600, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.15, vibratoRate: 2.5, vibratoDepth: 8,
  },
  'Horror': {
    osc1: { type: 'sawtooth', gain: 0.3, detune: -15, octave: 0 },
    osc2: { type: 'square', gain: 0.25, detune: 20, octave: 0 },
    osc3: { type: 'sine', gain: 0.2, detune: -25, octave: -1 },
    noise: { type: 'pink', gain: 0.08 },
    filter: { type: 'lowpass', cutoff: 800, resonance: 6, envAmount: 500 },
    env: { attack: 2.0, decay: 1.0, sustain: 0.5, release: 3.0 },
    filterEnv: { attack: 2.5, decay: 1.5, sustain: 0.3, release: 2.5 },
    filterLfo: { rate: 0.08, depth: 400, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0.2, vibratoRate: 1.5, vibratoDepth: 20,
  },
  'Ocean': {
    osc1: { type: 'sine', gain: 0.15, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.1, detune: 5, octave: -1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.5 },
    filter: { type: 'lowpass', cutoff: 800, resonance: 1, envAmount: 400 },
    env: { attack: 1.5, decay: 0.8, sustain: 0.5, release: 2.5 },
    filterEnv: { attack: 2.0, decay: 1.0, sustain: 0.3, release: 2.0 },
    filterLfo: { rate: 0.1, depth: 500, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Thunder': {
    osc1: { type: 'sine', gain: 0.3, detune: 0, octave: -1 },
    osc2: { type: 'sine', gain: 0.2, detune: -10, octave: -1 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.7 },
    filter: { type: 'lowpass', cutoff: 400, resonance: 2, envAmount: 600 },
    env: { attack: 0.01, decay: 1.5, sustain: 0.1, release: 2.0 },
    filterEnv: { attack: 0.01, decay: 1.0, sustain: 0, release: 1.5 },
    filterLfo: { rate: 0.15, depth: 200, type: 'sine' },
    masterGainVal: 0.35, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== RETRO & CHIPTUNE ==========
  'NES Square': {
    osc1: { type: 'square', gain: 0.6, detune: 0, octave: 0 },
    osc2: { type: 'square', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 10000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.05, sustain: 0.7, release: 0.02 },
    filterEnv: { attack: 0.001, decay: 0.05, sustain: 0.7, release: 0.02 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'NES Triangle': {
    osc1: { type: 'triangle', gain: 0.7, detune: 0, octave: 0 },
    osc2: { type: 'triangle', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 12000, resonance: 0.5, envAmount: 0 },
    env: { attack: 0.001, decay: 0.03, sustain: 0.8, release: 0.02 },
    filterEnv: { attack: 0.001, decay: 0.03, sustain: 0.8, release: 0.02 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Chip Arp': {
    osc1: { type: 'square', gain: 0.5, detune: 0, octave: 1 },
    osc2: { type: 'square', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0 },
    filter: { type: 'lowpass', cutoff: 6000, resonance: 1, envAmount: 2000 },
    env: { attack: 0.001, decay: 0.06, sustain: 0.1, release: 0.03 },
    filterEnv: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },
  'Retro Noise': {
    osc1: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    osc3: { type: 'sine', gain: 0, detune: 0, octave: 0 },
    noise: { type: 'white', gain: 0.6 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 1, envAmount: 0 },
    env: { attack: 0.001, decay: 0.08, sustain: 0.3, release: 0.04 },
    filterEnv: { attack: 0.001, decay: 0.05, sustain: 0.2, release: 0.03 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.25, pitchBend: 0, glide: 0, vibratoRate: 0, vibratoDepth: 0,
  },

  // ========== WORLD & ETHNIC ==========
  'Koto': {
    osc1: { type: 'sawtooth', gain: 0.4, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 1, octave: 1 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 2 },
    noise: { type: 'white', gain: 0.03 },
    filter: { type: 'lowpass', cutoff: 4000, resonance: 3, envAmount: 3000 },
    env: { attack: 0.001, decay: 0.4, sustain: 0.03, release: 0.5 },
    filterEnv: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0, vibratoRate: 6, vibratoDepth: 12,
  },
  'Didgeridoo': {
    osc1: { type: 'sawtooth', gain: 0.5, detune: 0, octave: -1 },
    osc2: { type: 'square', gain: 0.25, detune: 5, octave: -1 },
    osc3: { type: 'sine', gain: 0.3, detune: 0, octave: 0 },
    noise: { type: 'pink', gain: 0.06 },
    filter: { type: 'lowpass', cutoff: 600, resonance: 5, envAmount: 400 },
    env: { attack: 0.1, decay: 0.15, sustain: 0.85, release: 0.3 },
    filterEnv: { attack: 0.15, decay: 0.2, sustain: 0.7, release: 0.3 },
    filterLfo: { rate: 2, depth: 300, type: 'sine' },
    masterGainVal: 0.3, pitchBend: 0, glide: 0.05, vibratoRate: 3, vibratoDepth: 8,
  },
  'Erhu': {
    osc1: { type: 'sawtooth', gain: 0.45, detune: 0, octave: 0 },
    osc2: { type: 'sine', gain: 0.2, detune: 2, octave: 0 },
    osc3: { type: 'sine', gain: 0.1, detune: 0, octave: 1 },
    noise: { type: 'pink', gain: 0.02 },
    filter: { type: 'lowpass', cutoff: 3000, resonance: 2.5, envAmount: 1000 },
    env: { attack: 0.08, decay: 0.12, sustain: 0.8, release: 0.3 },
    filterEnv: { attack: 0.1, decay: 0.2, sustain: 0.6, release: 0.3 },
    filterLfo: { rate: 0, depth: 0, type: 'sine' },
    masterGainVal: 0.28, pitchBend: 0, glide: 0.05, vibratoRate: 6, vibratoDepth: 18,
  },
};

let currentPresetName = 'Piano';

function loadPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  currentPresetName = name;
  Object.assign(synthParams.osc1, p.osc1);
  Object.assign(synthParams.osc2, p.osc2);
  Object.assign(synthParams.osc3, p.osc3);
  Object.assign(synthParams.noise, p.noise || { type: 'white', gain: 0 });
  Object.assign(synthParams.filter, p.filter);
  Object.assign(synthParams.env, p.env);
  Object.assign(synthParams.filterEnv, p.filterEnv);
  Object.assign(synthParams.filterLfo, p.filterLfo || { rate: 0, depth: 0, type: 'sine' });
  synthParams.masterGainVal = p.masterGainVal;
  synthParams.pitchBend = p.pitchBend;
  synthParams.glide = p.glide;
  synthParams.vibratoRate = p.vibratoRate;
  synthParams.vibratoDepth = p.vibratoDepth;
}

function getPresetNames() {
  return Object.keys(PRESETS);
}

// Export current params as a JSON-friendly object (for user save/share)
function exportPatch() {
  return JSON.parse(JSON.stringify(synthParams));
}

function importPatch(patch) {
  if (patch.osc1) Object.assign(synthParams.osc1, patch.osc1);
  if (patch.osc2) Object.assign(synthParams.osc2, patch.osc2);
  if (patch.osc3) Object.assign(synthParams.osc3, patch.osc3);
  if (patch.noise) Object.assign(synthParams.noise, patch.noise);
  if (patch.filter) Object.assign(synthParams.filter, patch.filter);
  if (patch.env) Object.assign(synthParams.env, patch.env);
  if (patch.filterEnv) Object.assign(synthParams.filterEnv, patch.filterEnv);
  if (patch.filterLfo) Object.assign(synthParams.filterLfo, patch.filterLfo);
  if (patch.masterGainVal !== undefined) synthParams.masterGainVal = patch.masterGainVal;
  if (patch.pitchBend !== undefined) synthParams.pitchBend = patch.pitchBend;
  if (patch.glide !== undefined) synthParams.glide = patch.glide;
  if (patch.vibratoRate !== undefined) synthParams.vibratoRate = patch.vibratoRate;
  if (patch.vibratoDepth !== undefined) synthParams.vibratoDepth = patch.vibratoDepth;
  currentPresetName = 'Custom';
}

// --- Randomize: generate a random but musically usable patch ---
function randomizePatch() {
  const waves = ['sine', 'triangle', 'sawtooth', 'square'];
  const filterTypes = ['lowpass', 'highpass', 'bandpass'];
  const lfoWaves = ['sine', 'triangle', 'sawtooth', 'square'];
  const r = (min, max) => Math.random() * (max - min) + min;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // Oscillators — always have osc1 active, osc2/osc3 sometimes
  synthParams.osc1.type = pick(waves);
  synthParams.osc1.gain = r(0.4, 1.0);
  synthParams.osc1.detune = r(-10, 10);
  synthParams.osc1.octave = pick([0, 0, 0, -1, 1]); // bias toward 0

  synthParams.osc2.type = pick(waves);
  synthParams.osc2.gain = Math.random() > 0.3 ? r(0.05, 0.6) : 0;
  synthParams.osc2.detune = r(-15, 15);
  synthParams.osc2.octave = pick([-1, 0, 0, 1, 1, 2]);

  synthParams.osc3.type = pick(waves);
  synthParams.osc3.gain = Math.random() > 0.5 ? r(0.05, 0.4) : 0;
  synthParams.osc3.detune = r(-8, 8);
  synthParams.osc3.octave = pick([-1, -1, 0, 0, 1]);

  // Noise — usually off, sometimes a touch
  synthParams.noise.type = pick(['white', 'pink']);
  synthParams.noise.gain = Math.random() > 0.7 ? r(0.01, 0.12) : 0;

  // Filter
  synthParams.filter.type = pick(filterTypes);
  synthParams.filter.cutoff = Math.round(r(200, 12000));
  synthParams.filter.resonance = r(0.3, 12);
  synthParams.filter.envAmount = Math.round(r(0, 4000));

  // Amp envelope — keep in musical ranges
  synthParams.env.attack = r(0.002, 0.5);
  synthParams.env.decay = r(0.05, 0.8);
  synthParams.env.sustain = r(0.05, 0.9);
  synthParams.env.release = r(0.05, 1.2);

  // Filter envelope
  synthParams.filterEnv.attack = r(0.002, 0.4);
  synthParams.filterEnv.decay = r(0.05, 0.6);
  synthParams.filterEnv.sustain = r(0.0, 0.7);
  synthParams.filterEnv.release = r(0.05, 0.8);

  // Filter LFO — often off, sometimes subtle
  if (Math.random() > 0.6) {
    synthParams.filterLfo.rate = r(0.5, 8);
    synthParams.filterLfo.depth = r(50, 1500);
    synthParams.filterLfo.type = pick(lfoWaves);
  } else {
    synthParams.filterLfo.rate = 0;
    synthParams.filterLfo.depth = 0;
  }

  // Global
  synthParams.masterGainVal = r(0.2, 0.4);
  synthParams.pitchBend = 0;
  synthParams.glide = Math.random() > 0.7 ? r(0.02, 0.15) : 0;
  synthParams.vibratoRate = Math.random() > 0.6 ? r(2, 7) : 0;
  synthParams.vibratoDepth = synthParams.vibratoRate > 0 ? r(3, 20) : 0;

  currentPresetName = 'Custom';
}

// =====================
// EFFECTS CHAIN
// =====================
const masterGain = audioCtx.createGain();
masterGain.gain.setValueAtTime(0.8, audioCtx.currentTime);

// --- Soft-clip waveshaper for analog warmth ---
// Adds subtle harmonic saturation that makes everything sound fuller
const masterWaveshaper = audioCtx.createWaveShaper();
function buildSoftClipCurve(amount) {
  // amount: 0 = linear (bypass), 1 = heavy saturation
  // Using tanh-style curve for musical soft clipping
  const samples = 8192;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1; // -1 to +1
    // Blend between linear and tanh based on amount
    const linear = x;
    const saturated = Math.tanh(x * (1 + amount * 2));
    curve[i] = linear * (1 - amount) + saturated * amount;
  }
  return curve;
}
masterWaveshaper.curve = buildSoftClipCurve(0.25); // subtle warmth
masterWaveshaper.oversample = '2x'; // reduce aliasing artifacts

// --- Stereo widener on master ---
// Subtle stereo spread using mid-side processing via channel splitter
const stereoWidener = audioCtx.createStereoPanner
  ? (() => {
    // Simple approach: a very subtle delay on one channel via two parallel paths
    const splitter = audioCtx.createChannelSplitter(2);
    const merger = audioCtx.createChannelMerger(2);
    const widenerOut = audioCtx.createGain();

    // Left channel — slight pitch micro-shift via tiny modulated delay
    const delayL = audioCtx.createDelay(0.03);
    delayL.delayTime.setValueAtTime(0.0003, audioCtx.currentTime); // 0.3ms
    const lfoW = audioCtx.createOscillator();
    lfoW.frequency.setValueAtTime(0.5, audioCtx.currentTime);
    const lfoWGain = audioCtx.createGain();
    lfoWGain.gain.setValueAtTime(0.0002, audioCtx.currentTime); // very subtle modulation
    lfoW.connect(lfoWGain);
    lfoWGain.connect(delayL.delayTime);
    lfoW.start();

    splitter.connect(delayL, 0);
    delayL.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1); // right channel passes through

    merger.connect(widenerOut);
    return { input: splitter, output: widenerOut };
  })()
  : null;

// Chain: masterGain → waveshaper → widener → destination
masterGain.connect(masterWaveshaper);
if (stereoWidener) {
  masterWaveshaper.connect(stereoWidener.input);
  stereoWidener.output.connect(audioCtx.destination);
} else {
  masterWaveshaper.connect(audioCtx.destination);
}

// --- Analyser node for waveform/spectrum visualizer ---
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;
analyser.smoothingTimeConstant = 0.8;
masterGain.connect(analyser); // tap from masterGain so we get the full mix

const effects = {
  reverb:  { enabled: false, mix: 0.3 },
  delay:   { enabled: false, mix: 0.25 },
  chorus:  { enabled: false, mix: 0.3 },
};

const effectsSend = audioCtx.createGain();
effectsSend.gain.setValueAtTime(1, audioCtx.currentTime);
const dryGain = audioCtx.createGain();
dryGain.gain.setValueAtTime(1, audioCtx.currentTime);
effectsSend.connect(dryGain);
dryGain.connect(masterGain);

let reverbSend = null, delaySend = null, chorusSend = null;

async function createReverb() {
  const c = audioCtx.createConvolver();
  const rate = audioCtx.sampleRate;
  const len = rate * 2.8; // slightly longer tail
  const imp = audioCtx.createBuffer(2, len, rate);

  // --- Early reflections (first ~80ms) ---
  // Simulate a few discrete wall/ceiling bounces for spatial realism
  const earlyTaps = [
    // [timeMs, gainL, gainR] — asymmetric for stereo width
    [12, 0.4, 0.3],
    [19, 0.25, 0.35],
    [26, 0.3, 0.2],
    [33, 0.15, 0.25],
    [41, 0.2, 0.15],
    [53, 0.12, 0.18],
    [64, 0.1, 0.08],
    [78, 0.06, 0.1],
  ];

  for (let ch = 0; ch < 2; ch++) {
    const d = imp.getChannelData(ch);

    // Place early reflections as short filtered impulses
    earlyTaps.forEach(([ms, gL, gR]) => {
      const samp = Math.round(ms * rate / 1000);
      const gain = ch === 0 ? gL : gR;
      // Short burst (3-sample click smoothed) instead of single sample
      if (samp < len) {
        d[samp] += gain * 0.6;
        if (samp + 1 < len) d[samp + 1] += gain * 0.3;
        if (samp + 2 < len) d[samp + 2] += gain * 0.1;
      }
    });

    // --- Late diffuse tail (starts ~60ms, builds up, then decays) ---
    const lateStart = Math.round(0.06 * rate);
    const buildupEnd = Math.round(0.12 * rate); // density ramps up
    for (let i = lateStart; i < len; i++) {
      // Density ramp: sparse early, fully dense after buildupEnd
      const density = i < buildupEnd
        ? (i - lateStart) / (buildupEnd - lateStart)
        : 1;
      if (Math.random() > density * 0.85) continue;

      // Multi-stage decay for more natural room sound:
      // Fast initial decay (0.06s-0.3s), then slower tail
      const t = i / rate;
      let envelope;
      if (t < 0.3) {
        envelope = Math.exp(-3.0 * t) * 0.7; // fast early decay
      } else if (t < 1.2) {
        envelope = Math.exp(-2.2 * t) * 0.55; // medium body
      } else {
        envelope = Math.exp(-1.8 * t) * 0.4; // long gentle tail
      }

      // Shaped noise with slight high-frequency rolloff
      // Average 2 random samples to soften harshness
      const noise = (Math.random() + Math.random() - 1);
      d[i] += noise * envelope;
    }

    // --- Apply gentle high-frequency damping to the whole IR ---
    // Simple 1-pole lowpass to simulate air absorption
    let prev = 0;
    const damping = 0.3; // higher = more HF damping
    for (let i = 0; i < len; i++) {
      d[i] = d[i] * (1 - damping) + prev * damping;
      prev = d[i];
    }
  }

  c.buffer = imp;
  return c;
}

function createDelay() {
  const d = audioCtx.createDelay(2.0);
  d.delayTime.setValueAtTime(0.35, audioCtx.currentTime);
  const fb = audioCtx.createGain();
  fb.gain.setValueAtTime(0.3, audioCtx.currentTime);
  d.connect(fb); fb.connect(d);
  return d;
}

function createChorus() {
  const d1 = audioCtx.createDelay(0.05), d2 = audioCtx.createDelay(0.05);
  const l1 = audioCtx.createOscillator(), l2 = audioCtx.createOscillator();
  const lg1 = audioCtx.createGain(), lg2 = audioCtx.createGain();
  const out = audioCtx.createGain();
  d1.delayTime.setValueAtTime(0.012, audioCtx.currentTime);
  d2.delayTime.setValueAtTime(0.018, audioCtx.currentTime);
  l1.frequency.setValueAtTime(0.7, audioCtx.currentTime);
  l2.frequency.setValueAtTime(1.1, audioCtx.currentTime);
  lg1.gain.setValueAtTime(0.003, audioCtx.currentTime);
  lg2.gain.setValueAtTime(0.004, audioCtx.currentTime);
  l1.connect(lg1); lg1.connect(d1.delayTime);
  l2.connect(lg2); lg2.connect(d2.delayTime);
  l1.start(); l2.start();
  d1.connect(out); d2.connect(out);
  return { i1: d1, i2: d2, output: out };
}

let effectsReady = false;
async function initEffects() {
  const rv = await createReverb();
  reverbSend = audioCtx.createGain(); reverbSend.gain.setValueAtTime(0, audioCtx.currentTime);
  effectsSend.connect(reverbSend); reverbSend.connect(rv); rv.connect(masterGain);

  const dl = createDelay();
  delaySend = audioCtx.createGain(); delaySend.gain.setValueAtTime(0, audioCtx.currentTime);
  effectsSend.connect(delaySend); delaySend.connect(dl); dl.connect(masterGain);

  const ch = createChorus();
  chorusSend = audioCtx.createGain(); chorusSend.gain.setValueAtTime(0, audioCtx.currentTime);
  effectsSend.connect(chorusSend); chorusSend.connect(ch.i1); chorusSend.connect(ch.i2); ch.output.connect(masterGain);
}

async function ensureEffects() {
  if (effectsReady) return;
  effectsReady = true;
  await initEffects();
  applyEffectStates();
}

function applyEffectStates() {
  if (reverbSend) reverbSend.gain.setValueAtTime(effects.reverb.enabled ? effects.reverb.mix : 0, audioCtx.currentTime);
  if (delaySend) delaySend.gain.setValueAtTime(effects.delay.enabled ? effects.delay.mix : 0, audioCtx.currentTime);
  if (chorusSend) chorusSend.gain.setValueAtTime(effects.chorus.enabled ? effects.chorus.mix : 0, audioCtx.currentTime);
  const anyWet = effects.reverb.enabled || effects.delay.enabled || effects.chorus.enabled;
  dryGain.gain.setValueAtTime(anyWet ? 0.65 : 1, audioCtx.currentTime);
}

function toggleEffect(name) {
  if (!effects[name]) return false;
  effects[name].enabled = !effects[name].enabled;
  applyEffectStates();
  return effects[name].enabled;
}

// =====================
// SYNTH VOICE
// =====================
// --- Noise buffer cache ---
let whiteNoiseBuffer = null;
let pinkNoiseBuffer = null;

function getNoiseBuffer(type) {
  const len = audioCtx.sampleRate * 2;
  if (type === 'white') {
    if (!whiteNoiseBuffer) {
      whiteNoiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = whiteNoiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return whiteNoiseBuffer;
  }
  // Pink noise (Paul Kellet's algorithm)
  if (!pinkNoiseBuffer) {
    pinkNoiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = pinkNoiseBuffer.getChannelData(0);
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522;
      b5 = -0.7616*b5 - w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    pinkNoiseBuffer = pinkNoiseBuffer;
  }
  return pinkNoiseBuffer;
}

// Track last played frequency for glide/portamento
let lastPlayedFreq = null;

function playNote(freq, velocity = 127) {
  ensureEffects();
  const p = synthParams;
  const now = audioCtx.currentTime;

  // Velocity scaling: 0-127 MIDI range → 0.0-1.0 gain multiplier
  // Use a slight curve for more natural feel (power of 0.6)
  const velNorm = Math.max(0, Math.min(velocity, 127)) / 127;
  const velScale = Math.pow(velNorm, 0.6);

  // --- Velocity-dependent attack time ---
  // Harder hits = snappier attack (more percussive feel)
  // Soft hits = slightly slower attack (more gentle)
  const velAttackScale = 1.0 + (1.0 - velScale) * 0.8; // soft → 1.8x, hard → 1.0x
  const effectiveAttack = p.env.attack * velAttackScale;

  // --- Velocity-dependent brightness ---
  // Harder velocity = more filter envelope for brighter attack
  // Already scaled below, but also slightly boost cutoff on hard hits
  const velBrightnessBoost = velScale * 0.15; // up to +15% cutoff on hard hits

  const bendMult = Math.pow(2, p.pitchBend / 12);
  const baseFreq = freq * bendMult;

  // --- Build oscillators with stereo spread ---
  const oscs = [];
  const oscGains = [];
  const oscPanners = []; // for stereo spread
  const oscConfigs = [p.osc1, p.osc2, p.osc3];
  const voiceGain = audioCtx.createGain();

  // Stereo spread positions: osc1 center, osc2 slightly left, osc3 slightly right
  const panPositions = [0, -0.15, 0.15];

  for (let i = 0; i < 3; i++) {
    const cfg = oscConfigs[i];
    if (cfg.gain <= 0) continue;
    const osc = audioCtx.createOscillator();
    osc.type = cfg.type;
    const targetFreq = baseFreq * Math.pow(2, cfg.octave);
    // --- Glide/portamento: ramp from previous note's frequency ---
    if (p.glide > 0 && lastPlayedFreq !== null) {
      const fromFreq = lastPlayedFreq * Math.pow(2, cfg.octave);
      osc.frequency.setValueAtTime(fromFreq, now);
      osc.frequency.exponentialRampToValueAtTime(targetFreq, now + p.glide);
    } else {
      osc.frequency.setValueAtTime(targetFreq, now);
    }
    osc.detune.setValueAtTime(cfg.detune, now);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(cfg.gain, now);
    osc.connect(g);

    // Apply subtle stereo panning per oscillator
    if (audioCtx.createStereoPanner && panPositions[i] !== 0) {
      const panner = audioCtx.createStereoPanner();
      panner.pan.setValueAtTime(panPositions[i], now);
      g.connect(panner);
      oscPanners.push(panner);
      oscGains.push(panner); // panner becomes the output node
    } else {
      oscGains.push(g);
    }

    oscs.push(osc);
  }

  // --- Noise oscillator ---
  let noiseSource = null;
  if (p.noise.gain > 0) {
    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = getNoiseBuffer(p.noise.type);
    noiseSource.loop = true;
    const ng = audioCtx.createGain();
    ng.gain.setValueAtTime(p.noise.gain, now);
    noiseSource.connect(ng);
    oscGains.push(ng);
  }

  // --- Filter ---
  const filter = audioCtx.createBiquadFilter();
  filter.type = p.filter.type;
  filter.Q.setValueAtTime(p.filter.resonance, now);

  const filterBase = p.filter.cutoff * (1 + velBrightnessBoost);
  const filterEnvAmt = p.filter.envAmount * velScale;
  const filterPeak = Math.min(filterBase + filterEnvAmt, 20000);
  filter.frequency.setValueAtTime(filterBase, now);
  if (filterEnvAmt > 0) {
    filter.frequency.linearRampToValueAtTime(filterPeak, now + p.filterEnv.attack);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(filterBase + filterEnvAmt * p.filterEnv.sustain, 20),
      now + p.filterEnv.attack + p.filterEnv.decay
    );
  }

  // --- Filter LFO ---
  let filterLfoNode = null;
  if (p.filterLfo.rate > 0 && p.filterLfo.depth > 0) {
    filterLfoNode = audioCtx.createOscillator();
    filterLfoNode.type = p.filterLfo.type;
    filterLfoNode.frequency.setValueAtTime(p.filterLfo.rate, now);
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(p.filterLfo.depth, now);
    filterLfoNode.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    filterLfoNode.start(now);
  }

  // Connect oscs → filter → voiceGain
  oscGains.forEach(g => g.connect(filter));
  filter.connect(voiceGain);

  // --- Vibrato (LFO → pitch) ---
  let vibratoLfo = null;
  if (p.vibratoRate > 0 && p.vibratoDepth > 0) {
    vibratoLfo = audioCtx.createOscillator();
    vibratoLfo.frequency.setValueAtTime(p.vibratoRate, now);
    const vibGain = audioCtx.createGain();
    vibGain.gain.setValueAtTime(p.vibratoDepth, now);
    vibratoLfo.connect(vibGain);
    oscs.forEach(osc => vibGain.connect(osc.detune));
    vibratoLfo.start(now);
  }

  // --- Amplitude envelope (ADSR) — velocity-scaled with improved curves ---
  const peakGain = p.masterGainVal * velScale;
  const sustainLevel = peakGain * p.env.sustain;
  voiceGain.gain.setValueAtTime(0, now);

  // Use exponential ramp for attack (more natural onset) — but linearRamp
  // for very short attacks to avoid the exponential "never reaches 0" issue
  if (effectiveAttack > 0.01) {
    // Exponential attack sounds more natural for longer attacks
    voiceGain.gain.setValueAtTime(0.001, now); // exponential can't start from 0
    voiceGain.gain.exponentialRampToValueAtTime(peakGain, now + effectiveAttack);
  } else {
    voiceGain.gain.linearRampToValueAtTime(peakGain, now + effectiveAttack);
  }

  // Exponential decay for more natural sustain transition
  if (sustainLevel > 0.001) {
    voiceGain.gain.exponentialRampToValueAtTime(
      Math.max(sustainLevel, 0.001),
      now + effectiveAttack + p.env.decay
    );
  } else {
    voiceGain.gain.linearRampToValueAtTime(sustainLevel, now + effectiveAttack + p.env.decay);
  }

  voiceGain.connect(effectsSend);

  // Start everything
  oscs.forEach(o => o.start(now));
  if (noiseSource) noiseSource.start(now);

  const maxDur = 30;
  oscs.forEach(o => o.stop(now + maxDur));
  if (noiseSource) noiseSource.stop(now + maxDur);
  if (vibratoLfo) vibratoLfo.stop(now + maxDur);
  if (filterLfoNode) filterLfoNode.stop(now + maxDur);

  // Track frequency for glide/portamento
  lastPlayedFreq = baseFreq;

  return { voiceGain, oscs, filter, vibratoLfo, filterLfoNode, noiseSource, startTime: now };
}

function stopNote(noteObj) {
  if (!noteObj) return;
  const p = synthParams;
  const now = audioCtx.currentTime;

  noteObj.voiceGain.gain.cancelScheduledValues(now);
  const currentGain = noteObj.voiceGain.gain.value;
  noteObj.voiceGain.gain.setValueAtTime(currentGain, now);

  // Exponential release sounds more natural (like a real string/key damping)
  if (currentGain > 0.001 && p.env.release > 0.02) {
    noteObj.voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + p.env.release);
  } else {
    noteObj.voiceGain.gain.linearRampToValueAtTime(0.0001, now + p.env.release);
  }

  if (noteObj.filter && p.filter.envAmount > 0) {
    noteObj.filter.frequency.cancelScheduledValues(now);
    noteObj.filter.frequency.setValueAtTime(noteObj.filter.frequency.value, now);
    // Exponential filter release for smoother tonal decay
    const targetFreq = Math.max(p.filter.cutoff, 20);
    if (noteObj.filter.frequency.value > targetFreq * 1.1) {
      noteObj.filter.frequency.exponentialRampToValueAtTime(targetFreq, now + p.filterEnv.release);
    } else {
      noteObj.filter.frequency.linearRampToValueAtTime(targetFreq, now + p.filterEnv.release);
    }
  }

  const stopTime = now + p.env.release + 0.05;
  noteObj.oscs.forEach(o => { try { o.stop(stopTime); } catch(e) {} });
  if (noteObj.noiseSource) { try { noteObj.noiseSource.stop(stopTime); } catch(e) {} }
  if (noteObj.vibratoLfo) { try { noteObj.vibratoLfo.stop(stopTime); } catch(e) {} }
  if (noteObj.filterLfoNode) { try { noteObj.filterLfoNode.stop(stopTime); } catch(e) {} }
}

function resumeAudio() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// ============================================
// ARPEGGIATOR
// ============================================
// Holds notes that are currently pressed, cycles through them
// at a rate derived from the metronome BPM.

const arpState = {
  on: false,
  pattern: 'up',       // 'up', 'down', 'up-down', 'random'
  rate: '1/8',          // note subdivision relative to BPM: '1/4', '1/8', '1/16'
  octaves: 1,           // 1-3: how many octaves to span
  heldNotes: [],        // [{freq, id, note, octave}] — notes the user is holding
  sequence: [],         // computed sequence of frequencies based on pattern
  seqIndex: 0,
  direction: 1,         // 1 = ascending, -1 = descending (for up-down)
  timer: null,
  nextStepTime: 0,
  currentArpNote: null, // the currently sounding arp voice
  gate: 0.8,            // fraction of step duration the note sounds (0-1)
};

// Rate multipliers: how many steps per beat
const ARP_RATE_MAP = {
  '1/4': 1,
  '1/8': 2,
  '1/16': 4,
  '1/4T': 1.5,   // triplet
  '1/8T': 3,
};

function arpGetBpm() {
  // Use metronome BPM if available (from recorder.js), fallback to 120
  return (typeof metronomeBpm !== 'undefined') ? metronomeBpm : 120;
}

function arpBuildSequence() {
  const s = arpState;
  if (s.heldNotes.length === 0) { s.sequence = []; return; }

  // Sort held notes by frequency (low to high)
  const sorted = [...s.heldNotes].sort((a, b) => a.freq - b.freq);

  // Expand across octaves
  const expanded = [];
  for (let oct = 0; oct < s.octaves; oct++) {
    sorted.forEach(n => {
      expanded.push({
        freq: n.freq * Math.pow(2, oct),
        id: n.id,
        note: n.note,
        octave: n.octave + oct,
      });
    });
  }

  switch (s.pattern) {
    case 'up':
      s.sequence = expanded;
      break;
    case 'down':
      s.sequence = [...expanded].reverse();
      break;
    case 'up-down':
      // Up then down, excluding endpoints on the return to avoid double-hits
      if (expanded.length <= 1) {
        s.sequence = expanded;
      } else {
        s.sequence = [...expanded, ...expanded.slice(1, -1).reverse()];
      }
      break;
    case 'random':
      s.sequence = expanded; // we'll randomize at step time
      break;
  }

  // Keep seqIndex in bounds
  if (s.sequence.length > 0) {
    s.seqIndex = s.seqIndex % s.sequence.length;
  }
}

function arpScheduleStep() {
  const s = arpState;
  if (!s.on || s.sequence.length === 0) return;

  const stepsPerBeat = ARP_RATE_MAP[s.rate] || 2;
  const stepDuration = 60.0 / (arpGetBpm() * stepsPerBeat);
  const scheduleAhead = 0.1;

  while (s.nextStepTime < audioCtx.currentTime + scheduleAhead) {
    // Pick the note for this step
    let noteData;
    if (s.pattern === 'random') {
      noteData = s.sequence[Math.floor(Math.random() * s.sequence.length)];
    } else {
      noteData = s.sequence[s.seqIndex];
      s.seqIndex = (s.seqIndex + 1) % s.sequence.length;
    }

    if (noteData) {
      // Schedule note-on at exact time
      const noteOnTime = s.nextStepTime;
      const noteDuration = stepDuration * s.gate;

      // Stop previous arp note if still sounding
      if (s.currentArpNote) {
        stopNote(s.currentArpNote);
        s.currentArpNote = null;
      }

      // Play the note
      const voice = playNote(noteData.freq);
      s.currentArpNote = voice;

      // Schedule note-off
      const offDelay = (noteOnTime - audioCtx.currentTime + noteDuration) * 1000;
      setTimeout(() => {
        if (s.currentArpNote === voice) {
          stopNote(voice);
          s.currentArpNote = null;
        }
      }, Math.max(0, offDelay));

      // Record if recording is active
      if (typeof recordMidiNoteOn === 'function') {
        const msUntilOn = (noteOnTime - audioCtx.currentTime) * 1000;
        setTimeout(() => {
          recordMidiNoteOn('arp_' + noteData.id, noteData.note, noteData.octave);
        }, Math.max(0, msUntilOn));
        setTimeout(() => {
          if (typeof recordMidiNoteOff === 'function') recordMidiNoteOff('arp_' + noteData.id);
        }, Math.max(0, msUntilOn + noteDuration * 1000));
      }
    }

    s.nextStepTime += stepDuration;
  }
}

function arpStart() {
  const s = arpState;
  if (s.timer) return;
  s.seqIndex = 0;
  s.nextStepTime = audioCtx.currentTime;
  arpBuildSequence();
  s.timer = setInterval(arpScheduleStep, 25); // 25ms lookahead interval
  arpScheduleStep();
}

function arpStop() {
  const s = arpState;
  if (s.timer) { clearInterval(s.timer); s.timer = null; }
  if (s.currentArpNote) { stopNote(s.currentArpNote); s.currentArpNote = null; }
  s.seqIndex = 0;
}

function arpAddNote(freq, id, note, octave) {
  const s = arpState;
  // Don't add duplicates
  if (s.heldNotes.some(n => n.id === id)) return;
  s.heldNotes.push({ freq, id, note, octave });
  arpBuildSequence();
  // Start the scheduler if arp is on and we just got our first note
  if (s.on && s.heldNotes.length === 1 && !s.timer) arpStart();
}

function arpRemoveNote(id) {
  const s = arpState;
  s.heldNotes = s.heldNotes.filter(n => n.id !== id);
  arpBuildSequence();
  // Stop if no notes held
  if (s.heldNotes.length === 0) arpStop();
}

function arpToggle(on) {
  arpState.on = on;
  if (on && arpState.heldNotes.length > 0) {
    arpStart();
  } else if (!on) {
    arpStop();
  }
}

function arpSetPattern(pattern) {
  arpState.pattern = pattern;
  arpState.seqIndex = 0;
  arpBuildSequence();
}

function arpSetRate(rate) {
  arpState.rate = rate;
}

function arpSetOctaves(oct) {
  arpState.octaves = Math.max(1, Math.min(3, oct));
  arpBuildSequence();
}

function arpSetGate(gate) {
  arpState.gate = Math.max(0.1, Math.min(1, gate));
}
