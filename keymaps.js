// ============================================
// keymaps.js — Keyboard layout definitions
// ============================================

// --- STANDARD LAYOUT ---
// Bottom row (A-;) = white keys, top row (W-P) = black keys
// Z/X = octave shift, Space = sustain
const STANDARD_MAP = [
  { key: 'a', note: 'C', black: false, octOffset: 0 },
  { key: 'w', note: 'C#', black: true, octOffset: 0 },
  { key: 's', note: 'D', black: false, octOffset: 0 },
  { key: 'e', note: 'D#', black: true, octOffset: 0 },
  { key: 'd', note: 'E', black: false, octOffset: 0 },
  { key: 'f', note: 'F', black: false, octOffset: 0 },
  { key: 't', note: 'F#', black: true, octOffset: 0 },
  { key: 'g', note: 'G', black: false, octOffset: 0 },
  { key: 'y', note: 'G#', black: true, octOffset: 0 },
  { key: 'h', note: 'A', black: false, octOffset: 0 },
  { key: 'u', note: 'A#', black: true, octOffset: 0 },
  { key: 'j', note: 'B', black: false, octOffset: 0 },
  { key: 'k', note: 'C', black: false, octOffset: 1 },
  { key: 'o', note: 'C#', black: true, octOffset: 1 },
  { key: 'l', note: 'D', black: false, octOffset: 1 },
  { key: 'p', note: 'D#', black: true, octOffset: 1 },
  { key: ';', note: 'E', black: false, octOffset: 1 },
];

// Keys reserved for non-note functions in standard mode
const STANDARD_SPECIAL = {
  octaveDown: 'z',
  octaveUp: 'x',
  sustain: ' ',
};

// --- EXTENDED LAYOUT ---
// Uses all 4 rows for ~3 octaves, no octave shift keys needed
// Row 1 (bottom, Z row): white keys C3–E4 (includes , . /)
// Row 2 (A row): black keys for Z-row whites
// Row 3 (Q row): white keys F4–A5
// Row 4 (number row): black keys for Q-row whites
//
// Chromatic ordering (base octave = 3):
// Z=C3, S=C#3, X=D3, D=D#3, C=E3, V=F3, G=F#3, B=G3, H=G#3, N=A3, J=A#3, M=B3,
// ,=C4, K=C#4, .=D4, L=D#4, /=E4,
// Q=F4, 2=F#4, W=G4, 3=G#4, E=A4, 4=A#4, R=B4,
// T=C5, 6=C#5, Y=D5, 7=D#5, U=E5, I=F5, 9=F#5, O=G5, 0=G#5, P=A5

const EXTENDED_MAP = [
  // --- Lower register (Z row = white, A row = black) ---
  { key: 'z', note: 'C', black: false, octOffset: 0 },
  { key: 's', note: 'C#', black: true, octOffset: 0 },
  { key: 'x', note: 'D', black: false, octOffset: 0 },
  { key: 'd', note: 'D#', black: true, octOffset: 0 },
  { key: 'c', note: 'E', black: false, octOffset: 0 },
  { key: 'v', note: 'F', black: false, octOffset: 0 },
  { key: 'g', note: 'F#', black: true, octOffset: 0 },
  { key: 'b', note: 'G', black: false, octOffset: 0 },
  { key: 'h', note: 'G#', black: true, octOffset: 0 },
  { key: 'n', note: 'A', black: false, octOffset: 0 },
  { key: 'j', note: 'A#', black: true, octOffset: 0 },
  { key: 'm', note: 'B', black: false, octOffset: 0 },
  { key: ',', note: 'C', black: false, octOffset: 1 },
  { key: 'l', note: 'C#', black: true, octOffset: 1 },
  { key: '.', note: 'D', black: false, octOffset: 1 },
  { key: ';', note: 'D#', black: true, octOffset: 1 },
  { key: '/', note: 'E', black: false, octOffset: 1 },

  // --- Upper register (Q row = white, Number row = black) ---
  // Continues chromatically from F4
  { key: 'q', note: 'F', black: false, octOffset: 1 },
  { key: '2', note: 'F#', black: true, octOffset: 1 },
  { key: 'w', note: 'G', black: false, octOffset: 1 },
  { key: '3', note: 'G#', black: true, octOffset: 1 },
  { key: 'e', note: 'A', black: false, octOffset: 1 },
  { key: '4', note: 'A#', black: true, octOffset: 1 },
  { key: 'r', note: 'B', black: false, octOffset: 1 },
  { key: 't', note: 'C', black: false, octOffset: 2 },
  { key: '6', note: 'C#', black: true, octOffset: 2 },
  { key: 'y', note: 'D', black: false, octOffset: 2 },
  { key: '7', note: 'D#', black: true, octOffset: 2 },
  { key: 'u', note: 'E', black: false, octOffset: 2 },
  { key: 'i', note: 'F', black: false, octOffset: 2 },
  { key: '9', note: 'F#', black: true, octOffset: 2 },
  { key: 'o', note: 'G', black: false, octOffset: 2 },
  { key: '0', note: 'G#', black: true, octOffset: 2 },
  { key: 'p', note: 'A', black: false, octOffset: 2 },
];

const EXTENDED_SPECIAL = {
  sustain: ' ',
  // No octave shift keys — all rows are used for notes
};

// --- Layout accessor ---
const LAYOUTS = {
  standard: { map: STANDARD_MAP, special: STANDARD_SPECIAL, name: 'Standard', desc: 'A–L keys • Z/X octave shift • Space = Sustain' },
  extended: { map: EXTENDED_MAP, special: EXTENDED_SPECIAL, name: 'Extended', desc: 'All 4 rows • ~3 octaves' },
  full88:   { map: [], special: { sustain: ' ' }, name: 'Full 88', desc: 'Full piano • click or MIDI keyboard' },
};

// --- Full 88-key piano data (A0 to C8) ---
// Generated programmatically — 88 keys, MIDI 21–108
const FULL_88_KEYS = [];
(function buildFull88() {
  // Piano starts at A0 (MIDI 21), ends at C8 (MIDI 108)
  const noteData = [
    // Each entry: [noteName, isBlack]
    ['C', false], ['C#', true], ['D', false], ['D#', true], ['E', false],
    ['F', false], ['F#', true], ['G', false], ['G#', true], ['A', false],
    ['A#', true], ['B', false],
  ];
  // A0, A#0, B0 (MIDI 21–23)
  const startNotes = [
    { note: 'A', black: false, midi: 21, octave: 0 },
    { note: 'A#', black: true, midi: 22, octave: 0 },
    { note: 'B', black: false, midi: 23, octave: 0 },
  ];
  startNotes.forEach(n => FULL_88_KEYS.push(n));
  // C1 through B7 (7 full octaves, MIDI 24–107)
  for (let oct = 1; oct <= 7; oct++) {
    for (let i = 0; i < 12; i++) {
      FULL_88_KEYS.push({
        note: noteData[i][0],
        black: noteData[i][1],
        midi: (oct + 1) * 12 + i,
        octave: oct,
      });
    }
  }
  // C8 (MIDI 108)
  FULL_88_KEYS.push({ note: 'C', black: false, midi: 108, octave: 8 });
})();

// MIDI number to note name + octave
function midiToNoteName(midi) {
  const noteNames = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const note = noteNames[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { note, octave };
}
