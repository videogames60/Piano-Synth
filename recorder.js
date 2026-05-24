// ============================================
// recorder.js — Recording, WAV/MIDI export, library & 4-track player
// ============================================

// =====================
// RECORDING ENGINE
// =====================
let isRecording = false;
let recordingStartTime = 0;
let mediaRecorder = null;
let recordedChunks = [];
let midiEvents = [];       // { note, octave, startTime, endTime, velocity }
let activeMidiNotes = {};  // key -> { note, octave, startTime }
let recordingDest = null;
let recordingPatch = null; // snapshot of synth settings at record time

function startRecording() {
  if (isRecording) return;

  // Snapshot synth settings at record start
  recordingPatch = exportPatch();
  recordingPatch._presetName = currentPresetName;
  recordingPatch._effects = JSON.parse(JSON.stringify(effects));

  // Create a MediaStream destination from the audio context
  recordingDest = audioCtx.createMediaStreamDestination();
  // Tap the waveshaper output for recording (captures warmth + effects)
  masterWaveshaper.connect(recordingDest);

  recordedChunks = [];
  midiEvents = [];
  activeMidiNotes = {};
  recordingStartTime = audioCtx.currentTime;

  // Use MediaRecorder to capture the stream
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  mediaRecorder = new MediaRecorder(recordingDest.stream, { mimeType });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start(100); // collect in 100ms chunks
  isRecording = true;
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return null;

  return new Promise((resolve) => {
    // Close out any still-held MIDI notes
    const endTime = audioCtx.currentTime - recordingStartTime;
    Object.keys(activeMidiNotes).forEach(key => {
      const ev = activeMidiNotes[key];
      ev.endTime = endTime;
      midiEvents.push(ev);
      delete activeMidiNotes[key];
    });

    mediaRecorder.onstop = async () => {
      masterWaveshaper.disconnect(recordingDest);
      recordingDest = null;

      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
      const duration = endTime;

      // Decode to AudioBuffer for WAV export and waveform display
      const arrayBuf = await blob.arrayBuffer();
      let audioBuffer = null;
      try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuf);
      } catch (e) {
        console.warn('Could not decode recording for WAV:', e);
      }

      const recording = {
        id: Date.now(),
        name: 'Recording ' + (library.length + 1),
        blob,
        audioBuffer,
        midiEvents: [...midiEvents],
        patch: recordingPatch,
        duration,
        createdAt: new Date(),
      };

      isRecording = false;
      mediaRecorder = null;
      resolve(recording);
    };

    mediaRecorder.stop();
  });
}

// Called by piano-ui when a note is pressed/released during recording
function recordMidiNoteOn(key, note, octave) {
  if (!isRecording) return;
  const t = audioCtx.currentTime - recordingStartTime;
  activeMidiNotes[key] = { note, octave, startTime: t, endTime: t, velocity: 100 };
}

function recordMidiNoteOff(key) {
  if (!isRecording) return;
  const ev = activeMidiNotes[key];
  if (!ev) return;
  ev.endTime = audioCtx.currentTime - recordingStartTime;
  if (ev.endTime - ev.startTime < 0.01) ev.endTime = ev.startTime + 0.01;
  midiEvents.push(ev);
  delete activeMidiNotes[key];
}

// =====================
// SESSION LIBRARY (max 10)
// =====================
const MAX_LIBRARY = 10;
let library = [];

function addToLibrary(recording) {
  if (library.length >= MAX_LIBRARY) {
    // Remove oldest
    library.shift();
  }
  library.push(recording);
  renderLibrary();
}

function removeFromLibrary(id) {
  library = library.filter(r => r.id !== id);
  // Also remove from any tracks
  tracks.forEach(t => {
    if (t.recording && t.recording.id === id) {
      t.recording = null;
    }
  });
  renderLibrary();
  renderTracks();
}

function renameInLibrary(id, newName) {
  const rec = library.find(r => r.id === id);
  if (rec) rec.name = newName;
  renderLibrary();
  renderTracks();
}

// =====================
// WAV EXPORT
// =====================
function exportWav(recording) {
  if (!recording.audioBuffer) {
    alert('Audio data not available for WAV export.');
    return;
  }
  const buf = recording.audioBuffer;
  const numCh = buf.numberOfChannels;
  const sampleRate = buf.sampleRate;
  const length = buf.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numCh * bytesPerSample;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channel data
  const channels = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buf.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let sample = channels[ch][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  downloadBlob(blob, sanitizeFilename(recording.name) + '.wav');
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// =====================
// MIDI EXPORT (Standard MIDI File — Format 0)
// =====================
function exportMidi(recording) {
  if (!recording.midiEvents || recording.midiEvents.length === 0) {
    alert('No MIDI note data in this recording.');
    return;
  }

  const TICKS_PER_BEAT = 480;
  const TEMPO_BPM = 120;
  const ticksPerSecond = TICKS_PER_BEAT * (TEMPO_BPM / 60);

  // Convert events to absolute-tick note on/off pairs
  const midiList = [];
  recording.midiEvents.forEach(ev => {
    const midiNote = noteToMidi(ev.note, ev.octave);
    const onTick = Math.round(ev.startTime * ticksPerSecond);
    const offTick = Math.round(ev.endTime * ticksPerSecond);
    midiList.push({ tick: onTick, type: 'on', note: midiNote, velocity: ev.velocity || 100 });
    midiList.push({ tick: offTick, type: 'off', note: midiNote, velocity: 0 });
  });

  // Sort by tick, offs before ons at same tick
  midiList.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));

  // Build track data with delta times
  const trackBytes = [];

  // Tempo meta event: FF 51 03 tttttt
  const usPerBeat = Math.round(60000000 / TEMPO_BPM);
  trackBytes.push(0x00); // delta 0
  trackBytes.push(0xFF, 0x51, 0x03);
  trackBytes.push((usPerBeat >> 16) & 0xFF, (usPerBeat >> 8) & 0xFF, usPerBeat & 0xFF);

  // Track name
  const trackName = recording.name || 'Keys Recording';
  trackBytes.push(0x00); // delta 0
  trackBytes.push(0xFF, 0x03, trackName.length);
  for (let i = 0; i < trackName.length; i++) trackBytes.push(trackName.charCodeAt(i));

  let prevTick = 0;
  midiList.forEach(ev => {
    const delta = ev.tick - prevTick;
    prevTick = ev.tick;
    // Write variable-length delta
    const vlq = encodeVLQ(delta);
    vlq.forEach(b => trackBytes.push(b));
    // Note on/off (channel 0)
    if (ev.type === 'on') {
      trackBytes.push(0x90, ev.note & 0x7F, ev.velocity & 0x7F);
    } else {
      trackBytes.push(0x80, ev.note & 0x7F, 0x00);
    }
  });

  // End of track
  trackBytes.push(0x00, 0xFF, 0x2F, 0x00);

  // Build file
  const header = [
    0x4D, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // header length
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    (TICKS_PER_BEAT >> 8) & 0xFF, TICKS_PER_BEAT & 0xFF,
  ];

  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B, // MTrk
    (trackBytes.length >> 24) & 0xFF,
    (trackBytes.length >> 16) & 0xFF,
    (trackBytes.length >> 8) & 0xFF,
    trackBytes.length & 0xFF,
  ];

  const fileBytes = new Uint8Array([...header, ...trackHeader, ...trackBytes]);
  const blob = new Blob([fileBytes], { type: 'audio/midi' });
  downloadBlob(blob, sanitizeFilename(recording.name) + '.mid');
}

function noteToMidi(noteName, octave) {
  const idx = NOTE_NAMES.indexOf(noteName);
  return (octave + 1) * 12 + idx;
}

function encodeVLQ(value) {
  if (value < 0) value = 0;
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  bytes.reverse();
  return bytes;
}

// =====================
// SYNTH SETTINGS EXPORT (readable text + JSON)
// =====================
function formatPatchReadable(patch) {
  const lines = [];
  const bar = '─'.repeat(44);
  const name = patch._presetName || 'Custom';

  lines.push(bar);
  lines.push('  KEYS — Synth Settings');
  lines.push('  Preset: ' + name);
  lines.push(bar);
  lines.push('');

  // Oscillators
  const oscNames = ['Oscillator 1', 'Oscillator 2', 'Oscillator 3 (Sub)'];
  ['osc1', 'osc2', 'osc3'].forEach((key, i) => {
    const o = patch[key];
    if (o.gain <= 0) {
      lines.push('  ' + oscNames[i] + ':  OFF');
    } else {
      lines.push('  ' + oscNames[i] + ':');
      lines.push('    Waveform:    ' + o.type.charAt(0).toUpperCase() + o.type.slice(1));
      lines.push('    Gain:        ' + o.gain.toFixed(2));
      lines.push('    Detune:      ' + (o.detune > 0 ? '+' : '') + o.detune + ' cents');
      lines.push('    Octave:      ' + (o.octave > 0 ? '+' : '') + o.octave);
    }
    lines.push('');
  });

  // Noise
  if (patch.noise && patch.noise.gain > 0) {
    lines.push('  Noise:');
    lines.push('    Type:        ' + (patch.noise.type || 'white').charAt(0).toUpperCase() + (patch.noise.type || 'white').slice(1));
    lines.push('    Gain:        ' + patch.noise.gain.toFixed(2));
    lines.push('');
  }

  // Filter
  const f = patch.filter;
  lines.push('  Filter:');
  lines.push('    Type:        ' + f.type.charAt(0).toUpperCase() + f.type.slice(1));
  lines.push('    Cutoff:      ' + Math.round(f.cutoff) + ' Hz');
  lines.push('    Resonance:   ' + f.resonance.toFixed(1));
  lines.push('    Env Amount:  ' + Math.round(f.envAmount));
  lines.push('');

  // Amp Envelope
  const e = patch.env;
  lines.push('  Amp Envelope (ADSR):');
  lines.push('    Attack:      ' + fmtTime(e.attack));
  lines.push('    Decay:       ' + fmtTime(e.decay));
  lines.push('    Sustain:     ' + (e.sustain * 100).toFixed(0) + '%');
  lines.push('    Release:     ' + fmtTime(e.release));
  lines.push('');

  // Filter Envelope
  const fe = patch.filterEnv;
  lines.push('  Filter Envelope:');
  lines.push('    Attack:      ' + fmtTime(fe.attack));
  lines.push('    Decay:       ' + fmtTime(fe.decay));
  lines.push('    Sustain:     ' + (fe.sustain * 100).toFixed(0) + '%');
  lines.push('    Release:     ' + fmtTime(fe.release));
  lines.push('');

  // Filter LFO
  if (patch.filterLfo && (patch.filterLfo.rate > 0 || patch.filterLfo.depth > 0)) {
    lines.push('  Filter LFO:');
    lines.push('    Rate:        ' + patch.filterLfo.rate.toFixed(1) + ' Hz');
    lines.push('    Depth:       ' + Math.round(patch.filterLfo.depth));
    lines.push('    Waveform:    ' + patch.filterLfo.type.charAt(0).toUpperCase() + patch.filterLfo.type.slice(1));
    lines.push('');
  }

  // Pitch & Modulation
  lines.push('  Pitch & Modulation:');
  lines.push('    Pitch Bend:  ' + (patch.pitchBend > 0 ? '+' : '') + patch.pitchBend + ' semitones');
  if (patch.vibratoRate > 0) {
    lines.push('    Vibrato:     ' + patch.vibratoRate.toFixed(1) + ' Hz, depth ' + Math.round(patch.vibratoDepth) + ' cents');
  } else {
    lines.push('    Vibrato:     Off');
  }
  if (patch.glide > 0) {
    lines.push('    Glide:       ' + fmtTime(patch.glide));
  }
  lines.push('    Volume:      ' + patch.masterGainVal.toFixed(2));
  lines.push('');

  // Effects
  if (patch._effects) {
    const fx = patch._effects;
    const fxList = [];
    if (fx.reverb && fx.reverb.enabled) fxList.push('Reverb (mix ' + (fx.reverb.mix * 100).toFixed(0) + '%)');
    if (fx.delay && fx.delay.enabled) fxList.push('Delay (mix ' + (fx.delay.mix * 100).toFixed(0) + '%)');
    if (fx.chorus && fx.chorus.enabled) fxList.push('Chorus (mix ' + (fx.chorus.mix * 100).toFixed(0) + '%)');
    lines.push('  Effects:       ' + (fxList.length > 0 ? fxList.join(', ') : 'None'));
    lines.push('');
  }

  lines.push(bar);
  lines.push('  Use these values to recreate this sound');
  lines.push('  in any synth with similar controls.');
  lines.push(bar);

  return lines.join('\n');
}

function fmtTime(sec) {
  if (sec >= 1) return sec.toFixed(2) + ' s';
  return Math.round(sec * 1000) + ' ms';
}

function exportSynthSettings(recording) {
  if (!recording.patch) {
    alert('No synth settings saved for this recording.');
    return;
  }
  const text = formatPatchReadable(recording.patch);
  const blob = new Blob([text], { type: 'text/plain' });
  downloadBlob(blob, sanitizeFilename(recording.name) + ' - Synth Settings.txt');
}

// =====================
// OVERDUB (play tracks while recording)
// =====================
let isOverdubbing = false;   // true when recording + tracks playing simultaneously
let overdubAutoStop = null;  // timeout handle for auto-stopping when longest track ends

function hasPlayableTracks() {
  // Returns true if any track has a recording with audio data AND is audible
  return tracks.some(t => {
    if (!t.recording || !t.recording.audioBuffer) return false;
    if (t.muted && !hasSolo()) return true;  // muted but no solo — still counts as "has content"
    if (hasSolo() && !t.solo) return false;
    return true;
  });
}

function hasAnyTrackContent() {
  return tracks.some(t => t.recording && t.recording.audioBuffer);
}

// Start track playback for overdub — plays through destination (headphones)
// but does NOT route into recordingDest, so only live playing gets recorded
function startOverdubPlayback() {
  if (isPlaying) stopAllTracks();

  trackSources = [];
  let maxDuration = 0;

  tracks.forEach((t, i) => {
    if (!t.recording || !t.recording.audioBuffer) return;
    if (t.muted && !hasSolo()) return;
    if (hasSolo() && !t.solo) return;

    const src = audioCtx.createBufferSource();
    src.buffer = t.recording.audioBuffer;
    src.connect(t.gainNode);  // gainNode → destination (NOT recordingDest)
    src.start(audioCtx.currentTime);
    trackSources.push(src);

    if (t.recording.duration > maxDuration) maxDuration = t.recording.duration;
  });

  if (trackSources.length === 0) return 0;

  isPlaying = true;
  isOverdubbing = true;
  playStartTime = audioCtx.currentTime;
  updatePlayButton();
  startPlayTimer(maxDuration);

  return maxDuration;
}

function stopOverdub() {
  if (overdubAutoStop) {
    clearTimeout(overdubAutoStop);
    overdubAutoStop = null;
  }
  if (isPlaying) stopAllTracks();
  isOverdubbing = false;
  updateOverdubIndicator(false);
}

function updateOverdubIndicator(active) {
  const indicator = document.getElementById('overdubIndicator');
  if (!indicator) return;
  if (active) {
    indicator.classList.add('active');
  } else {
    indicator.classList.remove('active');
  }
}

// =====================
// 4-TRACK PLAYER
// =====================
const NUM_TRACKS = 4;
let tracks = [];
let isPlaying = false;
let trackSources = [];     // active AudioBufferSourceNodes
let playStartTime = 0;
let playTimerRAF = null;

function initTracks() {
  tracks = [];
  for (let i = 0; i < NUM_TRACKS; i++) {
    tracks.push({
      id: i,
      recording: null,
      volume: 0.8,
      muted: false,
      solo: false,
      gainNode: audioCtx.createGain(),
    });
    tracks[i].gainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
    tracks[i].gainNode.connect(audioCtx.destination);
  }
}

function assignToTrack(trackIdx, recording) {
  if (trackIdx < 0 || trackIdx >= NUM_TRACKS) return;
  tracks[trackIdx].recording = recording;
  renderTracks();
}

function removeFromTrack(trackIdx) {
  tracks[trackIdx].recording = null;
  renderTracks();
}

function playAllTracks() {
  if (isPlaying) stopAllTracks();
  resumeAudio();

  trackSources = [];
  let maxDuration = 0;

  tracks.forEach((t, i) => {
    if (!t.recording || !t.recording.audioBuffer) return;
    if (t.muted && !hasSolo()) return;
    if (hasSolo() && !t.solo) return;

    const src = audioCtx.createBufferSource();
    src.buffer = t.recording.audioBuffer;
    src.connect(t.gainNode);
    src.start(audioCtx.currentTime);
    trackSources.push(src);

    if (t.recording.duration > maxDuration) maxDuration = t.recording.duration;
  });

  if (trackSources.length === 0) return;

  isPlaying = true;
  playStartTime = audioCtx.currentTime;
  updatePlayButton();
  startPlayTimer(maxDuration);

  // Auto-stop after longest track
  setTimeout(() => {
    if (isPlaying) stopAllTracks();
  }, maxDuration * 1000 + 200);
}

function stopAllTracks() {
  trackSources.forEach(src => { try { src.stop(); } catch(e) {} });
  trackSources = [];
  isPlaying = false;
  updatePlayButton();
  cancelAnimationFrame(playTimerRAF);
  updatePlayhead(0, 1);
  // If overdub was active, clear the visual indicator but leave recording running
  if (isOverdubbing) {
    isOverdubbing = false;
    updateOverdubIndicator(false);
  }
}

function hasSolo() {
  return tracks.some(t => t.solo);
}

function setTrackVolume(idx, vol) {
  tracks[idx].volume = vol;
  tracks[idx].gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
}

function toggleTrackMute(idx) {
  tracks[idx].muted = !tracks[idx].muted;
  const effective = tracks[idx].muted ? 0 : tracks[idx].volume;
  tracks[idx].gainNode.gain.setValueAtTime(effective, audioCtx.currentTime);
  renderTracks();
}

function toggleTrackSolo(idx) {
  tracks[idx].solo = !tracks[idx].solo;
  // Recalculate all gains
  const anySolo = hasSolo();
  tracks.forEach((t, i) => {
    let vol = t.volume;
    if (anySolo && !t.solo) vol = 0;
    if (t.muted && !anySolo) vol = 0;
    t.gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
  });
  renderTracks();
}

function startPlayTimer(maxDuration) {
  const tick = () => {
    if (!isPlaying) return;
    const elapsed = audioCtx.currentTime - playStartTime;
    updatePlayhead(elapsed, maxDuration);
    if (elapsed < maxDuration) {
      playTimerRAF = requestAnimationFrame(tick);
    }
  };
  playTimerRAF = requestAnimationFrame(tick);
}

// =====================
// HELPERS
// =====================
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'recording';
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

// =====================
// UI RENDERING
// =====================
function renderLibrary() {
  const list = document.getElementById('libraryList');
  if (!list) return;
  list.innerHTML = '';

  const countBadge = document.getElementById('libCount');
  if (countBadge) countBadge.textContent = library.length + ' / ' + MAX_LIBRARY;

  if (library.length === 0) {
    list.innerHTML = '<div class="lib-empty">No recordings yet — hit Record and play!</div>';
    return;
  }

  library.forEach((rec, idx) => {
    const item = document.createElement('div');
    item.className = 'lib-item';
    item.draggable = true;
    item.dataset.recId = rec.id;

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', rec.id.toString());
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));

    // Mini waveform canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'lib-waveform';
    canvas.width = 80;
    canvas.height = 28;
    drawMiniWaveform(canvas, rec.audioBuffer);

    const info = document.createElement('div');
    info.className = 'lib-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'lib-name';
    nameEl.textContent = rec.name;
    nameEl.title = 'Click to rename';
    nameEl.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'lib-rename-input';
      input.value = rec.name;
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      const finish = () => {
        const newName = input.value.trim() || rec.name;
        renameInLibrary(rec.id, newName);
      };
      input.addEventListener('blur', finish);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    });

    const dur = document.createElement('span');
    dur.className = 'lib-duration';
    dur.textContent = formatDuration(rec.duration);

    const midi = document.createElement('span');
    midi.className = 'lib-midi-count';
    midi.textContent = rec.midiEvents.length + ' notes';

    info.appendChild(nameEl);
    const meta = document.createElement('div');
    meta.className = 'lib-meta';
    meta.appendChild(dur);
    meta.appendChild(midi);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'lib-actions';

    const playBtn = document.createElement('button');
    playBtn.className = 'lib-btn lib-play';
    playBtn.innerHTML = '&#9654;';
    playBtn.title = 'Preview';
    let previewSrc = null;
    playBtn.addEventListener('click', () => {
      if (previewSrc) { try { previewSrc.stop(); } catch(e) {} previewSrc = null; playBtn.innerHTML = '&#9654;'; return; }
      if (!rec.audioBuffer) return;
      resumeAudio();
      previewSrc = audioCtx.createBufferSource();
      previewSrc.buffer = rec.audioBuffer;
      previewSrc.connect(audioCtx.destination);
      previewSrc.start();
      playBtn.innerHTML = '&#9632;';
      previewSrc.onended = () => { previewSrc = null; playBtn.innerHTML = '&#9654;'; };
    });

    const wavBtn = document.createElement('button');
    wavBtn.className = 'lib-btn';
    wavBtn.textContent = 'WAV';
    wavBtn.title = 'Export as WAV audio file';
    wavBtn.addEventListener('click', () => exportWav(rec));

    const midiBtn = document.createElement('button');
    midiBtn.className = 'lib-btn';
    midiBtn.textContent = 'MIDI';
    midiBtn.title = 'Export as MIDI file';
    midiBtn.addEventListener('click', () => exportMidi(rec));

    const synthBtn = document.createElement('button');
    synthBtn.className = 'lib-btn';
    synthBtn.textContent = 'SYNTH';
    synthBtn.title = 'Export synth settings as readable text file';
    synthBtn.addEventListener('click', () => exportSynthSettings(rec));

    const delBtn = document.createElement('button');
    delBtn.className = 'lib-btn lib-del';
    delBtn.innerHTML = '&times;';
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', () => removeFromLibrary(rec.id));

    actions.appendChild(playBtn);
    actions.appendChild(wavBtn);
    actions.appendChild(midiBtn);
    actions.appendChild(synthBtn);
    actions.appendChild(delBtn);

    item.appendChild(canvas);
    item.appendChild(info);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function drawMiniWaveform(canvas, audioBuffer) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!audioBuffer) return;

  const data = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / canvas.width));
  const mid = canvas.height / 2;

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(200, 170, 120, 0.5)';
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x++) {
    let min = 1, max = -1;
    const start = x * step;
    for (let j = 0; j < step && start + j < data.length; j++) {
      const v = data[start + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    ctx.moveTo(x, mid + min * mid);
    ctx.lineTo(x, mid + max * mid);
  }
  ctx.stroke();
}

function renderTracks() {
  for (let i = 0; i < NUM_TRACKS; i++) {
    const trackEl = document.getElementById('track' + i);
    if (!trackEl) continue;
    const t = tracks[i];
    const label = trackEl.querySelector('.track-label');
    const waveCanvas = trackEl.querySelector('.track-waveform');
    const muteBtn = trackEl.querySelector('.track-mute');
    const soloBtn = trackEl.querySelector('.track-solo');
    const volSlider = trackEl.querySelector('.track-vol');
    const removeBtn = trackEl.querySelector('.track-remove');

    if (t.recording) {
      label.textContent = t.recording.name;
      trackEl.classList.add('has-recording');
      drawTrackWaveform(waveCanvas, t.recording.audioBuffer);
      removeBtn.style.display = '';
    } else {
      label.textContent = 'Track ' + (i + 1) + ' — drag a recording here';
      trackEl.classList.remove('has-recording');
      const ctx2 = waveCanvas.getContext('2d');
      ctx2.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
      removeBtn.style.display = 'none';
    }

    muteBtn.classList.toggle('active', t.muted);
    soloBtn.classList.toggle('active', t.solo);
    volSlider.value = t.volume;
  }
}

function drawTrackWaveform(canvas, audioBuffer) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
  const h = canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h);
  if (!audioBuffer) return;

  const data = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  const mid = h / 2;

  // Filled waveform
  ctx.fillStyle = 'rgba(200, 170, 120, 0.25)';
  ctx.beginPath();
  ctx.moveTo(0, mid);
  for (let x = 0; x < w; x++) {
    let max = 0;
    const start = x * step;
    for (let j = 0; j < step && start + j < data.length; j++) {
      const v = Math.abs(data[start + j]);
      if (v > max) max = v;
    }
    ctx.lineTo(x, mid - max * mid);
  }
  for (let x = w - 1; x >= 0; x--) {
    let max = 0;
    const start = x * step;
    for (let j = 0; j < step && start + j < data.length; j++) {
      const v = Math.abs(data[start + j]);
      if (v > max) max = v;
    }
    ctx.lineTo(x, mid + max * mid);
  }
  ctx.closePath();
  ctx.fill();

  // Center line
  ctx.strokeStyle = 'rgba(200, 170, 120, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
}

function updatePlayhead(elapsed, maxDuration) {
  const pct = maxDuration > 0 ? Math.min(elapsed / maxDuration, 1) : 0;
  const playhead = document.getElementById('trackPlayhead');
  if (playhead) playhead.style.left = (pct * 100) + '%';
  const timeDisplay = document.getElementById('trackTime');
  if (timeDisplay) timeDisplay.textContent = formatDuration(elapsed);
}

function updatePlayButton() {
  const btn = document.getElementById('trackPlayBtn');
  if (!btn) return;
  btn.innerHTML = isPlaying ? '&#9632;' : '&#9654;';
  btn.classList.toggle('active', isPlaying);
}

function updateRecordButton(state) {
  const btn = document.getElementById('recBtn');
  if (!btn) return;

  if (state === 'countdown') {
    btn.classList.add('recording');
    btn.classList.remove('overdubbing');
    btn.querySelector('.rec-dot').style.background = 'rgba(230, 200, 100, 1)';
    btn.querySelector('.rec-label').textContent = 'Ready...';
  } else if (state === true) {
    btn.classList.add('recording');
    // Show overdub state if tracks are playing
    if (isOverdubbing) {
      btn.classList.add('overdubbing');
      btn.querySelector('.rec-label').textContent = 'Stop';
    } else {
      btn.classList.remove('overdubbing');
      btn.querySelector('.rec-label').textContent = 'Stop';
    }
    btn.querySelector('.rec-dot').style.background = 'rgba(240, 80, 80, 1)';
  } else {
    btn.classList.remove('recording', 'overdubbing');
    btn.querySelector('.rec-dot').style.background = 'rgba(220, 80, 80, 0.6)';
    btn.querySelector('.rec-label').textContent = 'Record';
  }
}

// =====================
// METRONOME — Web Audio scheduled (no drift)
// =====================
let metronomeOn = false;
let metronomeBpm = 120;
let metronomeTimeSig = 4;   // beats per bar
let metronomeTimer = null;
let metronomeBeat = 0;      // current beat in bar (0-indexed)
let metronomeNextBeatTime = 0; // audioCtx.currentTime of next scheduled beat

// Lookahead scheduler constants
const METRO_LOOKAHEAD_MS = 25;   // how often the scheduler runs (ms)
const METRO_SCHEDULE_AHEAD = 0.1; // how far ahead to schedule (seconds)

function scheduleMetronomeClick(time, accent) {
  // Schedule a click at an exact audioCtx time — rock-solid timing
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const freq = accent ? 1200 : 800;
  const vol = accent ? 0.35 : 0.2;

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

  osc.connect(gain);
  gain.connect(audioCtx.destination); // direct to destination, bypasses masterGain/recorder
  osc.start(time);
  osc.stop(time + 0.06);

  // Schedule visual pulse — use setTimeout aligned to when the beat will actually play
  const msUntilBeat = (time - audioCtx.currentTime) * 1000;
  setTimeout(() => {
    const btn = document.getElementById('metroToggle');
    if (btn && metronomeOn) {
      btn.style.transform = 'scale(1.15)';
      setTimeout(() => { btn.style.transform = ''; }, 80);
    }
  }, Math.max(0, msUntilBeat));
}

// Legacy wrapper for countdown (plays immediately)
function playMetronomeClick(accent) {
  scheduleMetronomeClick(audioCtx.currentTime, accent);
}

function metronomeScheduler() {
  // Schedule all beats that fall within the lookahead window
  const secondsPerBeat = 60.0 / metronomeBpm;

  while (metronomeNextBeatTime < audioCtx.currentTime + METRO_SCHEDULE_AHEAD) {
    const accent = metronomeBeat === 0;
    scheduleMetronomeClick(metronomeNextBeatTime, accent);
    metronomeBeat = (metronomeBeat + 1) % metronomeTimeSig;
    metronomeNextBeatTime += secondsPerBeat;
  }
}

function startMetronome() {
  if (metronomeTimer) return;
  metronomeBeat = 0;
  metronomeNextBeatTime = audioCtx.currentTime;
  metronomeTimer = setInterval(metronomeScheduler, METRO_LOOKAHEAD_MS);
  metronomeScheduler(); // kick off immediately
}

function stopMetronome() {
  if (metronomeTimer) {
    clearInterval(metronomeTimer);
    metronomeTimer = null;
  }
  metronomeBeat = 0;
}

function restartMetronome() {
  if (metronomeOn) {
    stopMetronome();
    startMetronome();
  }
}

// =====================
// RECORDING COUNTDOWN
// =====================
let isCountingDown = false;

function startCountdown() {
  return new Promise((resolve) => {
    isCountingDown = true;
    const overlay = document.getElementById('countdownOverlay');
    const numberEl = document.getElementById('countdownNumber');
    if (!overlay || !numberEl) { isCountingDown = false; resolve(); return; }

    overlay.classList.add('active');
    const beats = metronomeTimeSig; // count one full bar
    const intervalMs = 60000 / metronomeBpm;
    let count = beats;

    const tick = () => {
      if (count <= 0) {
        overlay.classList.remove('active');
        isCountingDown = false;
        resolve();
        return;
      }

      // Visual
      numberEl.textContent = count;
      numberEl.className = 'countdown-number';
      // Force reflow for animation restart
      void numberEl.offsetWidth;
      numberEl.className = 'countdown-number' + (count === 1 ? ' beat-flash' : '');

      // Audio click
      playMetronomeClick(count === beats);

      count--;
      setTimeout(tick, intervalMs);
    };

    tick();
  });
}

// =====================
// INIT STUDIO UI
// =====================
function initStudioUI() {
  initTracks();

  // Record button — with countdown + overdub
  const recBtn = document.getElementById('recBtn');
  recBtn.addEventListener('click', async () => {
    if (isCountingDown) return; // ignore clicks during countdown

    if (isRecording) {
      const rec = await stopRecording();
      updateRecordButton(false);
      // Stop overdub playback if active
      stopOverdub();
      if (rec) {
        addToLibrary(rec);
      }
    } else {
      resumeAudio();
      // Stop metronome during countdown so beats don't clash
      const wasMetronomeOn = metronomeOn;
      if (metronomeOn) stopMetronome();

      // Stop any current track playback before countdown
      if (isPlaying) stopAllTracks();

      updateRecordButton('countdown');
      await startCountdown();

      startRecording();
      updateRecordButton(true);

      // Start overdub: play tracks alongside recording if any have content
      if (hasAnyTrackContent()) {
        const maxDur = startOverdubPlayback();
        updateOverdubIndicator(true);
        // Note: we do NOT auto-stop recording when tracks end —
        // the user controls when to stop. But tracks will naturally
        // stop playing when their audio finishes.
      }

      // Restart metronome if it was on
      if (wasMetronomeOn) startMetronome();
    }
  });

  // Track play/stop — disabled during recording (overdub controls it)
  const trackPlayBtn = document.getElementById('trackPlayBtn');
  trackPlayBtn.addEventListener('click', () => {
    if (isRecording) return; // during recording, overdub controls track playback
    if (isPlaying) stopAllTracks();
    else playAllTracks();
  });

  // Track controls
  for (let i = 0; i < NUM_TRACKS; i++) {
    const trackEl = document.getElementById('track' + i);
    if (!trackEl) continue;

    // Drag-and-drop
    trackEl.addEventListener('dragover', (e) => { e.preventDefault(); trackEl.classList.add('drag-over'); });
    trackEl.addEventListener('dragleave', () => trackEl.classList.remove('drag-over'));
    trackEl.addEventListener('drop', (e) => {
      e.preventDefault();
      trackEl.classList.remove('drag-over');
      const recId = parseInt(e.dataTransfer.getData('text/plain'));
      const rec = library.find(r => r.id === recId);
      if (rec) assignToTrack(i, rec);
    });

    // Mute / Solo / Volume / Remove
    trackEl.querySelector('.track-mute').addEventListener('click', () => toggleTrackMute(i));
    trackEl.querySelector('.track-solo').addEventListener('click', () => toggleTrackSolo(i));
    trackEl.querySelector('.track-vol').addEventListener('input', (e) => setTrackVolume(i, parseFloat(e.target.value)));
    trackEl.querySelector('.track-remove').addEventListener('click', () => removeFromTrack(i));
  }

  // Studio toggle
  const studioToggle = document.getElementById('studioToggle');
  const studioPanel = document.getElementById('studioPanel');
  studioToggle.addEventListener('click', () => {
    const isOpen = studioPanel.classList.toggle('open');
    studioToggle.classList.toggle('active', isOpen);
  });

  // Metronome controls
  const metroToggle = document.getElementById('metroToggle');
  const metroBpmDisplay = document.getElementById('metroBpmDisplay');
  const metroBpmDown = document.getElementById('metroBpmDown');
  const metroBpmUp = document.getElementById('metroBpmUp');
  const metroTimeSigEl = document.getElementById('metroTimeSig');

  metroToggle.addEventListener('click', () => {
    resumeAudio();
    metronomeOn = !metronomeOn;
    metroToggle.classList.toggle('active', metronomeOn);
    if (metronomeOn) {
      startMetronome();
    } else {
      stopMetronome();
    }
  });

  metroBpmDown.addEventListener('click', () => {
    metronomeBpm = Math.max(40, metronomeBpm - 5);
    metroBpmDisplay.textContent = metronomeBpm;
    restartMetronome();
  });

  metroBpmUp.addEventListener('click', () => {
    metronomeBpm = Math.min(240, metronomeBpm + 5);
    metroBpmDisplay.textContent = metronomeBpm;
    restartMetronome();
  });

  metroTimeSigEl.addEventListener('change', () => {
    metronomeTimeSig = parseInt(metroTimeSigEl.value);
    restartMetronome();
  });

  renderLibrary();
  renderTracks();
}
