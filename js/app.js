// UI wiring: transport, tracks, readouts, canvas interaction, settings, PWA.
import { Engine, formatTime } from './engine.js';
import { describeNote, freqToMidi, midiToFreq } from './pitch.js';
import { drawView, drawOverview, sampleTrack, sampleLevel, geometry } from './render.js';
import { translate } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

const COLORS = ['#38e0d0', '#a78bfa', '#fbbf24', '#4ade80', '#60a5fa', '#f472b6'];

// Fixed-line mode: where the white line rests by default (fraction of plot width).
const PLAYHEAD_FRAC = 1 / 6;
// Follow mode: the current time is drawn this far from the left (1/6).
const FOLLOW_FRAC = 1 / 6;

const PRESETS = {
  voice: { minFreq: 65, maxFreq: 1600 },
  bass: { minFreq: 40, maxFreq: 500 },
  high: { minFreq: 180, maxFreq: 2600 },
  wide: { minFreq: 40, maxFreq: 3000 },
};

const SENS = {
  strict: { threshold: 0.1, minClarity: 0.65 },
  normal: { threshold: 0.15, minClarity: 0.5 },
  loose: { threshold: 0.22, minClarity: 0.35 },
};

const ICONS = {
  eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24"><path d="M4 4l16 16M9.9 6.8A9.6 9.6 0 0 1 12 6.5c6 0 9.5 5.5 9.5 5.5a17 17 0 0 1-3.4 3.9M6.2 8.2A17 17 0 0 0 2.5 12S6 17.5 12 17.5c1 0 2-.2 2.8-.6"/><path d="M10.6 10.6a2.6 2.6 0 0 0 3.5 3.5"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8 8 0 0 1 0 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h8M18 7h2M4 12h2M10 12h10M4 17h8M18 17h2"/><circle cx="15" cy="7" r="2.4"/><circle cx="7" cy="12" r="2.4"/><circle cx="15" cy="17" r="2.4"/></svg>',
};

const engine = new Engine();
const state = {
  settings: {
    range: 'voice',
    sensitivity: 'normal',
    windowSec: 10,
    lineMode: 'follow',
    lineDrag: 'freeze',
    showDb: true,
    lang: (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en',
  },
  view: { t0: 0, t1: 10, fMin: 65, fMax: 1600 },
  micSmoothMidi: 0,
  micCandidate: null,
  micLast: null,
  micClock: 0,
  dragTime: null,
  scrubTime: null,
  headFrac: PLAYHEAD_FRAC,
  follow: true,
  manualView: null,
  frozenView: null,
  drag: null,
  tipShown: false,
  busy: false,
  recording: false,
  recStartedAt: 0,
  recTimer: 0,
  recCount: 0,
  panelTrackId: null,
  piano: { activeMidi: null, hoverMidi: null, pointerId: null },
  dpr: 1,
  lastTs: 0,
  lastMicPoll: 0,
  lastReadout: 0,
  lastOverview: 0,
  cancelToken: null,
};

const el = {
  view: $('#view'),
  overview: $('#overview'),
  canvasBox: $('#canvas-box'),
  readouts: $('#readouts'),
  tracks: $('#tracks'),
  trackCount: $('#track-count'),
  micState: $('#mic-state'),
  empty: $('#empty'),
  progress: $('#progress'),
  progressBar: $('#progress-bar'),
  progressPct: $('#progress-pct'),
  progressLabel: $('#progress-label'),
  progressCancel: $('#progress-cancel'),
  fileInput: $('#file-input'),
  btnImport: $('#btn-import'),
  btnMic: $('#btn-mic'),
  btnDemo: $('#btn-demo'),
  btnPlay: $('#btn-play'),
  btnStop: $('#btn-stop'),
  btnSettings: $('#btn-settings'),
  btnLang: $('#btn-lang'),
  langLabel: $('#lang-label'),
  btnRecord: $('#btn-record'),
  recordLabel: $('#record-label'),
  trackPanel: $('#track-panel'),
  tpName: $('#tp-name'),
  tpDot: $('#tp-dot'),
  tpVolume: $('#tp-volume'),
  tpVolumeVal: $('#tp-volume-val'),
  tpSpeed: $('#tp-speed'),
  tpPitchSeg: $('#tp-pitch-seg'),
  tpColor: $('#tp-color'),
  tpExport: $('#tp-export'),
  tpClose: $('#tp-close'),
  btnFollow: $('#btn-follow'),
  btnMode: $('#btn-mode'),
  modeLabel: $('#mode-label'),
  lineDragSelect: $('#line-drag-select'),
  dbToggle: $('#db-toggle'),
  timeDisplay: $('#time-display'),
  windowSelect: $('#window-select'),
  rangeSelect: $('#range-select'),
  sensSelect: $('#sens-select'),
  settingsPanel: $('#settings-panel'),
  settingsClose: $('#settings-close'),
  settingsReanalyze: $('#settings-reanalyze'),
  toast: $('#toast'),
  emptyImport: $('#empty-import'),
  emptyMic: $('#empty-mic'),
  emptyDemo: $('#empty-demo'),
};

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'pitchscope.settings.v1';

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    state.settings = {
      range: raw.range in PRESETS ? raw.range : 'voice',
      sensitivity: raw.sensitivity in SENS ? raw.sensitivity : 'normal',
      windowSec: [5, 10, 20, 30].includes(Number(raw.windowSec)) ? Number(raw.windowSec) : 10,
      lineMode: raw.lineMode === 'fixed' ? 'fixed' : 'follow',
      lineDrag: ['freeze', 'scroll', 'pause'].includes(raw.lineDrag) ? raw.lineDrag : 'freeze',
      showDb: raw.showDb !== false,
      lang: raw.lang === 'en' || raw.lang === 'zh' ? raw.lang : state.settings.lang,
    };
    const hf = Number(raw.headFrac);
    if (Number.isFinite(hf)) state.headFrac = Math.min(0.92, Math.max(0.08, hf));
  } catch {
    /* defaults */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state.settings, headFrac: state.headFrac }));
  } catch {
    /* private mode */
  }
}

function applyDbVisibility() {
  el.readouts.classList.toggle('hide-db', state.settings.showDb === false);
}

function applySettings() {
  const preset = PRESETS[state.settings.range] ?? PRESETS.voice;
  const sens = SENS[state.settings.sensitivity] ?? SENS.normal;
  Object.assign(engine.settings, preset, sens, { windowSec: Number(state.settings.windowSec) });
  state.view.fMin = preset.minFreq;
  state.view.fMax = preset.maxFreq;
  engine.resetDetectors();

  el.rangeSelect.value = state.settings.range;
  el.sensSelect.value = state.settings.sensitivity;
  el.windowSelect.value = String(state.settings.windowSec);
  el.lineDragSelect.value = state.settings.lineDrag;
  el.dbToggle.checked = state.settings.showDb !== false;
  applyDbVisibility();
  saveSettings();
}

function t(key, vars) {
  return translate(state.settings.lang, key, vars);
}

function errorText(err) {
  if (err?.code === 'too-large') return t('error.tooLarge');
  if (err?.code === 'decode') return t('error.decode', { name: err.fileName || '' });
  if (err?.code === 'too-long') return t('error.tooLong');
  if (err?.code === 'audio-context') return t('error.audioContext');
  return err?.message || String(err);
}

function displayName(track) {
  if (!track) return '';
  if (track.kind === 'mic') return t('name.mic');
  if (track.nameKey) return t(track.nameKey, { n: track.nameNum ?? '' });
  return track.name;
}

function applyLanguage() {
  const lang = state.settings.lang === 'en' ? 'en' : 'zh';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('doc.title');

  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll('[data-i18n-html]')) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
  for (const node of document.querySelectorAll('[data-i18n-title]')) {
    node.title = t(node.dataset.i18nTitle);
  }
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  }

  el.langLabel.textContent = t('act.lang');
  el.btnLang.setAttribute('aria-label', t('act.langTitle'));
  el.btnLang.title = t('act.langTitle');

  updateModeUI();
  updateMicUI();
  updateRecordUI();
  const track = panelTrack();
  if (track) el.tpName.textContent = displayName(track);
  refreshTracks();
  updateReadouts(true);
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function icon(name) {
  return ICONS[name] || '';
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = 0;
function toast(message, ms = 3200) {
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

function nextColor() {
  const used = new Set(engine.fileTracks.map((t) => t.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[engine.fileTracks.length % COLORS.length];
}

function resetMicTimeline() {
  state.micClock = 0;
  state.micSmoothMidi = 0;
  state.micLast = null;
  if (engine.mic.track) engine.mic.track.points.length = 0;
}

function doSeek(seconds) {
  engine.seek(seconds);
  if (engine.mic.track) engine.mic.track.points.length = 0;
}

function isFixedLine() {
  return state.settings.lineMode === 'fixed';
}

function clampFrac(f) {
  return Math.min(0.94, Math.max(0.06, f));
}

function resetInteraction() {
  state.drag = null;
  state.scrubTime = null;
  state.frozenView = null;
  state.manualView = null;
  state.follow = true;
  el.view.classList.remove('panning', 'line-dragging', 'line-hover');
}

function setFollow(on) {
  state.follow = on;
  if (on) state.manualView = null;
  updateFollowButton();
}

function updateFollowButton() {
  const show = !isFixedLine() && !state.follow && engine.fileTracks.length > 0 && !state.drag;
  el.btnFollow.classList.toggle('hidden', !show);
}

function updateModeUI() {
  const fixed = isFixedLine();
  el.modeLabel.textContent = t(fixed ? 'mode.fixed' : 'mode.follow');
  el.btnMode.classList.toggle('fixed', fixed);
  el.btnMode.setAttribute('aria-pressed', String(fixed));
  el.btnMode.title = t(fixed ? 'mode.tipFixed' : 'mode.tipFollow');
  el.lineDragSelect.disabled = !fixed;
  updateFollowButton();
}

function setLineMode(mode) {
  state.settings.lineMode = mode === 'fixed' ? 'fixed' : 'follow';
  resetInteraction();
  saveSettings();
  updateModeUI();
  updateReadouts(true);
  toast(t(mode === 'fixed' ? 'mode.toastFixed' : 'mode.toastFollow'), 4200);
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  state.dpr = dpr;
  const box = el.canvasBox.getBoundingClientRect();
  if (box.width > 1 && box.height > 1) {
    el.view.width = Math.round(box.width * dpr);
    el.view.height = Math.round(box.height * dpr);
  }
  const ov = el.overview.getBoundingClientRect();
  if (ov.width > 1) {
    el.overview.width = Math.round(ov.width * dpr);
    el.overview.height = Math.round((ov.height || 58) * dpr);
  }
}

function trackRow(track, isMic) {
  const sub = isMic
    ? `<span>${t('kind.liveInput')}</span><span class="t-note" data-note="mic">—</span>`
    : `<span>${t('kind.audio')}</span><span>${formatTime(track.duration)}</span><span class="t-note" data-note="${track.id}">—</span>`;
  const actions = isMic
    ? `<button class="icon-btn" data-act="remove" title="${t('track.removeMic')}" aria-label="${t('track.removeMic')}">${icon('trash')}</button>`
    : `<button class="icon-btn ${track.visible ? '' : 'off'}" data-act="visible" title="${t('track.show')}">${icon(track.visible ? 'eye' : 'eyeOff')}</button>
       <button class="icon-btn ${track.muted ? 'off' : ''}" data-act="mute" title="${t('track.mute')}">${icon(track.muted ? 'mute' : 'sound')}</button>
       <button class="icon-btn" data-act="settings" title="${t('track.settings')}">${icon('sliders')}</button>
       <button class="icon-btn" data-act="remove" title="${t('track.remove')}">${icon('trash')}</button>`;
  return `<div class="track" data-id="${isMic ? 'mic' : track.id}" style="--c:${track.color}">
      <span class="t-dot"></span>
      <div class="t-main">
        <div class="t-name" title="${esc(displayName(track))}">${esc(displayName(track))}</div>
        <div class="t-sub">${sub}</div>
      </div>
      <div class="t-actions">${actions}</div>
    </div>`;
}

function readoutCard(track, isMic) {
  return `<article class="readout silent" data-card="${track.id}" style="--c:${track.color}">
      <div class="ro-top">
        <i class="dot"></i><span class="ro-name">${esc(displayName(track))}</span>
        <span class="ro-tag">${t(isMic ? 'kind.live' : 'kind.audio')}</span>
      </div>
      <div class="ro-value"><span class="ro-note dim">—</span></div>
      <div class="ro-foot"><span class="ro-freq">— Hz</span><span class="ro-cents">—</span></div>
      <div class="ro-level"><span class="ro-level-track"><i></i></span><span class="ro-db">— dB</span></div>
      <div class="ro-strip"><span class="ro-mark"></span></div>
    </article>`;
}

function refreshTracks() {
  const files = engine.fileTracks;
  const mic = engine.mic.active ? engine.mic.track : null;
  if (!files.length) {
    state.frozenView = null;
    state.scrubTime = null;
    state.drag = null;
    if (engine.mic.active && state.micClock < 1) {
      const frac = isFixedLine() ? state.headFrac : FOLLOW_FRAC;
      state.micClock = Number(state.settings.windowSec) * frac;
    }
  }
  el.view.classList.toggle('pannable', files.length > 0);
  updateFollowButton();
  el.trackCount.textContent = String(files.length + (mic ? 1 : 0));
  el.tracks.innerHTML = files.map((t) => trackRow(t, false)).join('') + (mic ? trackRow(mic, true) : '');
  el.readouts.innerHTML =
    files.map((t) => readoutCard(t, false)).join('') + (mic ? readoutCard(mic, true) : '');
  if (state.panelTrackId && !engine.fileTracks.some((t) => t.id === state.panelTrackId)) {
    closeTrackPanel();
  }
  updateEmpty();
  updateReadouts(true);
}

function updateEmpty() {
  const empty = !engine.fileTracks.length && !engine.mic.active;
  el.empty.classList.toggle('hidden', !empty);
}

function setCard(id, freq, db) {
  const card = el.readouts.querySelector(`[data-card="${id}"]`);
  if (!card) return;
  const noteEl = card.querySelector('.ro-note');
  const freqEl = card.querySelector('.ro-freq');
  const centsEl = card.querySelector('.ro-cents');
  const mark = card.querySelector('.ro-mark');
  const dbEl = card.querySelector('.ro-db');
  const levelBar = card.querySelector('.ro-level-track i');

  const hasDb = Number.isFinite(db) && db > -59.5;
  if (dbEl) dbEl.textContent = hasDb ? `${Math.round(db)} dB` : '— dB';
  if (levelBar) levelBar.style.width = hasDb ? `${Math.max(2, Math.min(100, ((db + 60) / 60) * 100))}%` : '0%';

  if (!freq) {
    noteEl.textContent = '—';
    noteEl.classList.add('dim');
    freqEl.textContent = '— Hz';
    centsEl.textContent = '—';
    mark.style.left = '50%';
    card.classList.toggle('silent', !hasDb || db < -45);
    return;
  }
  const d = describeNote(freq);
  noteEl.textContent = d.name;
  noteEl.classList.remove('dim');
  freqEl.textContent = `${freq.toFixed(freq < 99.5 ? 2 : 1)} Hz`;
  centsEl.textContent = `${d.cents > 0 ? '+' : ''}${d.cents}¢`;
  mark.style.left = `${50 + Math.max(-50, Math.min(50, d.cents))}%`;
  card.classList.remove('silent');
}

function setRowNote(id, freq) {
  const chip = el.tracks.querySelector(`[data-note="${id}"]`);
  if (!chip) return;
  chip.textContent = freq ? describeNote(freq).name : '—';
}

function updateReadouts(force = false) {
  const now = performance.now();
  if (!force && now - state.lastReadout < 80) return;
  state.lastReadout = now;

  const pos = state.scrubTime ?? state.dragTime ?? engine.position;
  for (const track of engine.fileTracks) {
    const p = sampleTrack(track, pos);
    const freq = p && p.clarity >= 0.45 ? p.freq : 0;
    setCard(track.id, freq, sampleLevel(track, pos));
    setRowNote(track.id, freq);
  }
  if (engine.mic.active) {
    const freq = state.micLast?.freq || 0;
    setCard('mic', freq, state.micLast?.db ?? -60);
    setRowNote('mic', freq);
  }

  const duration = engine.duration;
  el.timeDisplay.children[0].textContent = formatTime(pos);
  el.timeDisplay.children[2].textContent = formatTime(duration);
  el.btnPlay.classList.toggle('playing', engine.playing);
  el.btnPlay.setAttribute('aria-label', t(engine.playing ? 'transport.pause' : 'transport.play'));
  el.btnStop.disabled = !engine.fileTracks.length;
}

function currentView() {
  const span = Math.max(1, Number(state.settings.windowSec));
  const dur = engine.duration;
  const hasFiles = engine.fileTracks.length > 0;
  const pos = state.scrubTime ?? state.dragTime ?? (hasFiles ? engine.position : state.micClock);

  // While the white line itself is being dragged the graph must stay frozen.
  if (state.frozenView) {
    return {
      t0: state.frozenView.t0,
      t1: state.frozenView.t1,
      hasFiles,
      pos,
    };
  }

  if (isFixedLine()) {
    const frac = clampFrac(state.headFrac);
    const t0 = pos - span * frac;
    return { t0, t1: t0 + span, hasFiles, pos };
  }

  // Follow mode: after panning away, keep the manually chosen viewport.
  if (hasFiles && !state.follow && state.manualView && state.dragTime == null) {
    // Temporary frozen viewport (line dragging / manual panning).
    const t0 = state.manualView.t0;
    return { t0, t1: t0 + span, hasFiles, pos };
  }

  const t0 = hasFiles ? pos - span * FOLLOW_FRAC : Math.max(0, pos - span * FOLLOW_FRAC);
  return { t0, t1: t0 + span, hasFiles, pos };
}

/* ------------------------------------------------------------------ */
/* microphone                                                          */
/* ------------------------------------------------------------------ */

function pollMic(hasFiles) {
  const r = engine.readMic();
  const stamp = hasFiles ? engine.position : state.micClock;
  const db = r && r.rms > 0 ? 20 * Math.log10(Math.max(r.rms, 1e-6)) : -60;
  if (!r || !r.freq) {
    state.micLast = { freq: 0, db };
    state.micSmoothMidi = 0;
    state.micCandidate = null;
    return;
  }
  const midi = freqToMidi(r.freq);

  // Reject isolated octave errors at note transitions: require a big jump to
  // persist for three consecutive frames before accepting it.
  if (state.micSmoothMidi && Math.abs(midi - state.micSmoothMidi) > 6) {
    const cand = state.micCandidate;
    if (cand && Math.abs(cand.midi - midi) < 1.5) cand.count += 1;
    else state.micCandidate = { midi, count: 1 };
    if (state.micCandidate.count < 3) return;
    state.micCandidate = null;
  } else {
    state.micCandidate = null;
  }

  if (state.micSmoothMidi && Math.abs(midi - state.micSmoothMidi) < 2) {
    state.micSmoothMidi += (midi - state.micSmoothMidi) * 0.5;
  } else {
    state.micSmoothMidi = midi;
  }
  const freq = midiToFreq(state.micSmoothMidi);
  state.micLast = { freq, midi: state.micSmoothMidi, clarity: r.clarity, db };

  const track = engine.mic.track;
  if (!track) return;
  if (!hasFiles || engine.playing) {
    const pts = track.points;
    const last = pts[pts.length - 1];
    if (last && Math.abs(stamp - last.t) < 0.012) {
      last.f = freq;
      last.m = state.micSmoothMidi;
      last.c = r.clarity;
    } else {
      pts.push({ t: stamp, f: freq, m: state.micSmoothMidi, c: r.clarity });
      if (pts.length > 6000) pts.splice(0, pts.length - 3000);
    }
  }
}

async function toggleMic() {
  if (engine.mic.active) {
    engine.disableMic();
    resetMicTimeline();
    updateMicUI();
    refreshTracks();
    toast(t('mic.off'));
    return;
  }
  try {
    await engine.enableMic();
    resetMicTimeline();
    if (!engine.fileTracks.length) {
      // Start the live window with the playhead at its resting position.
      const frac = isFixedLine() ? state.headFrac : FOLLOW_FRAC;
      state.micClock = Number(state.settings.windowSec) * frac;
    }
    updateMicUI();
    refreshTracks();
  } catch (err) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      toast(t('mic.denied'), 5200);
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      toast(t('mic.notFound'));
    } else if (name === 'InsecureContext' || !window.isSecureContext) {
      toast(t('mic.insecure'), 5200);
    } else if (err?.code === 'mic-unsupported') {
      toast(t('mic.unsupported'));
    } else {
      toast(t('mic.fail', { msg: err?.message || err }));
    }
  }
}

function updateMicUI() {
  const on = engine.mic.active;
  el.btnMic.setAttribute('aria-pressed', String(on));
  el.btnMic.setAttribute('aria-label', t(on ? 'act.micOn' : 'act.mic'));
  el.btnMic.querySelector('span').textContent = t(on ? 'act.micOn' : 'act.mic');
  el.micState.textContent = t(on ? 'side.micLive' : 'side.micOff');
}

/* ------------------------------------------------------------------ */
/* files                                                               */
/* ------------------------------------------------------------------ */

function setProgress(ratio, pctText) {
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  el.progressBar.style.width = `${pct}%`;
  el.progressPct.textContent = pctText ?? `${pct}%`;
}

function showProgress(show, label) {
  el.progress.classList.toggle('hidden', !show);
  if (label) el.progressLabel.textContent = label;
}

async function addFiles(fileList) {
  const files = [...fileList].filter(
    (f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac|opus|webm)$/i.test(f.name),
  );
  if (!files.length) {
    toast(t('toast.pickFile'));
    return;
  }
  if (state.busy) {
    toast(t('toast.busy'));
    return;
  }

  state.busy = true;
  const token = { cancelled: false };
  state.cancelToken = token;
  showProgress(true, t('progress.preparing'));
  setProgress(0);

  try {
    for (let i = 0; i < files.length; i++) {
      if (token.cancelled) break;
      const file = files[i];
      const hadFiles = engine.fileTracks.length > 0;
      el.progressLabel.textContent = t('progress.analyzing', { i: i + 1, n: files.length, name: file.name });
      await engine.addFile(file, {
        color: nextColor(),
        token,
        onProgress: (ratio) => setProgress((i + ratio) / files.length),
      });
      if (!hadFiles) resetMicTimeline();
      refreshTracks();
      toast(t('toast.added', { name: file.name.replace(/\.[^.]+$/, '') }));
      if (!state.tipShown) {
        state.tipShown = true;
        setTimeout(() => toast(t('toast.tip'), 5000), 3200);
      }
    }
  } catch (err) {
    if (token.cancelled) toast(t('toast.cancelled'));
    else toast(errorText(err) || t('toast.importFail'));
  } finally {
    state.busy = false;
    state.cancelToken = null;
    showProgress(false);
    refreshTracks();
    resize();
  }
}

async function addDemo() {
  if (state.busy) return;
  state.busy = true;
  showProgress(true, t('progress.demo'));
  setProgress(0.4);
  try {
    const hadFiles = engine.fileTracks.length > 0;
    const demo = await engine.addDemo(nextColor());
    demo.nameKey = 'name.demo';
    if (!hadFiles) resetMicTimeline();
    refreshTracks();
    resize();
    toast(t('toast.demoReady'));
  } catch (err) {
    toast(errorText(err) || t('toast.demoFail'));
  } finally {
    state.busy = false;
    showProgress(false);
  }
}

async function reanalyzeAll() {
  const tracks = engine.fileTracks;
  if (!tracks.length) {
    toast(t('toast.noAudio'));
    return;
  }
  if (state.busy) return;
  state.busy = true;
  const token = { cancelled: false };
  state.cancelToken = token;
  showProgress(true, t('progress.reanalyze'));
  setProgress(0);
  try {
    for (let i = 0; i < tracks.length; i++) {
      if (token.cancelled) break;
      el.progressLabel.textContent = t('progress.reanalyzing', { i: i + 1, n: tracks.length, name: displayName(tracks[i]) });
      await engine.reanalyze(tracks[i], (ratio) => setProgress((i + ratio) / tracks.length), token);
    }
    toast(t('toast.reanalyzed'));
  } catch (err) {
    toast(errorText(err) || t('toast.reanalyzeFail'));
  } finally {
    state.busy = false;
    state.cancelToken = null;
    showProgress(false);
    refreshTracks();
  }
}

/* ------------------------------------------------------------------ */
/* recording                                                           */
/* ------------------------------------------------------------------ */

function bufferRms(buffer) {
  const data = buffer.getChannelData(0);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 16) {
    sum += data[i] * data[i];
    count++;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\/:*?"<>|]/g, '_');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function updateRecordUI() {
  const secs = state.recording ? (performance.now() - state.recStartedAt) / 1000 : 0;
  el.recordLabel.textContent = state.recording ? t('act.stopRec', { time: formatTime(secs) }) : t('act.record');
  el.btnRecord.title = t(state.recording ? 'rec.stopTitle' : 'rec.startTitle');
  el.btnRecord.classList.toggle('recording', state.recording);
  el.btnRecord.setAttribute('aria-pressed', String(state.recording));
  el.btnRecord.setAttribute('aria-label', t(state.recording ? 'rec.stopTitle' : 'act.record'));
}

async function toggleRecord() {
  if (state.recording) {
    await stopRecordingFlow();
    return;
  }
  try {
    await engine.startRecording();
    state.recording = true;
    state.recStartedAt = performance.now();
    updateRecordUI();
    clearInterval(state.recTimer);
    state.recTimer = setInterval(() => {
      updateRecordUI();
      if (performance.now() - state.recStartedAt > 5 * 60 * 1000) stopRecordingFlow();
    }, 500);
    toast(t('rec.start'), 4500);
  } catch (err) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      toast(t('rec.denied'), 4800);
    } else if (!window.isSecureContext) {
      toast(t('rec.insecure'), 4800);
    } else {
      toast(t('rec.startFail', { msg: err?.message || err }));
    }
  }
}

async function stopRecordingFlow() {
  if (!state.recording) return;
  state.recording = false;
  clearInterval(state.recTimer);
  state.recTimer = 0;
  updateRecordUI();

  const data = engine.stopRecording();
  if (!data || data.duration < 0.4) {
    toast(t('rec.tooShort'));
    return;
  }
  engine.pause();
  const backingAudible = bufferRms(data.backing) > 0.003;
  if (backingAudible) {
    // The new mix already contains the backing; silence the old tracks so the
    // take is not played twice.
    for (const track of engine.fileTracks) engine.setMuted(track.id, true);
  }
  state.recCount += 1;
  const take = state.recCount;
  const specs = [{ buffer: data.mix, key: 'name.recMix', muted: false }];
  if (bufferRms(data.backing) > 0.003) {
    specs.push({ buffer: data.backing, key: 'name.recBacking', muted: true });
  }
  if (bufferRms(data.mic) > 0.003) {
    specs.push({ buffer: data.mic, key: 'name.recMic', muted: true });
  }

  state.busy = true;
  showProgress(true, t('progress.record'));
  setProgress(0);
  try {
    for (let i = 0; i < specs.length; i++) {
      const specName = t(specs[i].key, { n: take });
      el.progressLabel.textContent = t('progress.recording', { i: i + 1, n: specs.length, name: specName });
      const added = await engine.addBufferTrack(specs[i].buffer, {
        name: specName,
        color: nextColor(),
        muted: specs[i].muted,
        onProgress: (ratio) => setProgress((i + ratio) / specs.length),
      });
      added.nameKey = specs[i].key;
      added.nameNum = take;
      refreshTracks();
    }
    toast(t('rec.done', { n: specs.length }) + (backingAudible ? t('rec.mutedOld') : ''), 5600);
  } catch (err) {
    toast(t('rec.fail', { msg: errorText(err) }));
  } finally {
    state.busy = false;
    showProgress(false);
    refreshTracks();
    resize();
  }
}

/* ------------------------------------------------------------------ */
/* per-track settings panel                                            */
/* ------------------------------------------------------------------ */

function panelTrack() {
  return engine.fileTracks.find((t) => t.id === state.panelTrackId) || null;
}

function setPitchSeg(preserve) {
  for (const btn of el.tpPitchSeg.querySelectorAll('button')) {
    btn.classList.toggle('active', (btn.dataset.mode === 'preserve') === preserve);
  }
}

function openTrackPanel(id) {
  const track = engine.fileTracks.find((t) => t.id === id);
  if (!track) return;
  state.panelTrackId = id;
  el.tpName.textContent = displayName(track);
  el.tpDot.style.setProperty('--c', track.color);
  const vol = Math.round((track.volume ?? 1) * 100);
  el.tpVolume.value = String(vol);
  el.tpVolumeVal.textContent = `${vol}%`;
  el.tpSpeed.value = String(track.speed || 1);
  el.tpColor.value = track.color;
  setPitchSeg(track.preservePitch !== false);
  el.trackPanel.classList.remove('hidden');
  el.settingsPanel.classList.add('hidden');
  el.btnSettings.setAttribute('aria-expanded', 'false');
}

function closeTrackPanel() {
  state.panelTrackId = null;
  el.trackPanel.classList.add('hidden');
}

function applyPanelSpeed() {
  const track = panelTrack();
  if (!track) return;
  const speed = Number(el.tpSpeed.value) || 1;
  const preserve = el.tpPitchSeg.querySelector('.active')?.dataset.mode !== 'shift';
  el.tpSpeed.disabled = true;
  toast(t('toast.speedApplying'), 1400);
  setTimeout(() => {
    try {
      engine.applyTrackSpeed(track.id, speed, preserve);
    } finally {
      el.tpSpeed.disabled = false;
      updateReadouts(true);
      resize();
    }
  }, 30);
}

/* ------------------------------------------------------------------ */
/* transport & seek                                                    */
/* ------------------------------------------------------------------ */

async function togglePlay() {
  if (!engine.fileTracks.length) {
    toast(t('toast.needAudio'));
    return;
  }
  if (engine.playing) {
    engine.pause();
  } else {
    await engine.play();
  }
  updateReadouts(true);
}

function timeAtClientX(clientX) {
  const rect = el.view.getBoundingClientRect();
  const g = geometry(rect.width, rect.height, state.view);
  const ratio = (clientX - rect.left - g.pad.left) / g.plotW;
  const t = state.view.t0 + ratio * (state.view.t1 - state.view.t0);
  return Math.max(0, Math.min(t, engine.duration));
}

function overviewTimeAt(clientX) {
  const rect = el.overview.getBoundingClientRect();
  const ratio = (clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(ratio, 1)) * engine.duration;
}

/* ------------------------------------------------------------------ */
/* frame loop                                                          */
/* ------------------------------------------------------------------ */

function frame(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - state.lastTs) / 1000));
  state.lastTs = ts;

  const hasFiles = engine.fileTracks.length > 0;

  if (engine.mic.active && !hasFiles) state.micClock += dt;
  if (engine.mic.active && ts - state.lastMicPoll >= 28) {
    state.lastMicPoll = ts;
    pollMic(hasFiles);
  }

  if (engine.playing && engine.position >= engine.duration - 0.02) {
    engine.pause();
    updateReadouts(true);
  }

  const view = currentView();
  state.view.t0 = view.t0;
  state.view.t1 = view.t1;

  const playhead = view.hasFiles
    ? (state.scrubTime ?? state.dragTime ?? engine.position)
    : (isFixedLine() ? state.micClock : -100);
  drawView(el.view, {
    dpr: state.dpr,
    tracks: engine.fileTracks,
    micTrack: engine.mic.active ? engine.mic.track : null,
    t0: view.t0,
    t1: view.t1,
    fMin: state.view.fMin,
    fMax: state.view.fMax,
    playhead,
    duration: engine.duration,
    piano: state.piano,
  });

  if (ts - state.lastOverview > 90) {
    state.lastOverview = ts;
    drawOverview(el.overview, {
      dpr: state.dpr,
      duration: engine.duration,
      tracks: engine.fileTracks,
      playhead: state.scrubTime ?? state.dragTime ?? engine.position,
      fMin: state.view.fMin,
      fMax: state.view.fMax,
    });
    updateReadouts();
  }

  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  el.btnImport.addEventListener('click', () => el.fileInput.click());
  el.emptyImport.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    addFiles(el.fileInput.files);
    el.fileInput.value = '';
  });
  el.btnLang.addEventListener('click', () => {
    state.settings.lang = state.settings.lang === 'zh' ? 'en' : 'zh';
    saveSettings();
    applyLanguage();
  });
  el.btnRecord.addEventListener('click', toggleRecord);
  el.tpClose.addEventListener('click', closeTrackPanel);
  el.tpVolume.addEventListener('input', () => {
    const track = panelTrack();
    if (!track) return;
    const value = Number(el.tpVolume.value);
    el.tpVolumeVal.textContent = `${value}%`;
    engine.setTrackVolume(track.id, value / 100);
  });
  el.tpSpeed.addEventListener('change', applyPanelSpeed);
  el.tpPitchSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    setPitchSeg(btn.dataset.mode === 'preserve');
    applyPanelSpeed();
  });
  el.tpColor.addEventListener('input', () => {
    const track = panelTrack();
    if (!track) return;
    track.color = el.tpColor.value;
    el.tpDot.style.setProperty('--c', track.color);
  });
  el.tpColor.addEventListener('change', () => {
    const track = panelTrack();
    if (track) {
      track.color = el.tpColor.value;
      el.tpDot.style.setProperty('--c', track.color);
    }
    refreshTracks();
  });
  el.tpExport.addEventListener('click', async () => {
    const track = panelTrack();
    if (!track) return;
    toast(t('toast.exporting'), 1600);
    try {
      const blob = await engine.renderTrackWav(track.id);
      if (!blob) throw new Error(t('export.noBlob'));
      downloadBlob(blob, `${displayName(track)}.wav`);
      toast(t('toast.exported'));
    } catch (err) {
      toast(t('toast.exportFail', { msg: errorText(err) }));
    }
  });
  el.btnMic.addEventListener('click', toggleMic);
  el.emptyMic.addEventListener('click', toggleMic);
  el.btnDemo.addEventListener('click', addDemo);
  el.emptyDemo.addEventListener('click', addDemo);
  el.btnPlay.addEventListener('click', togglePlay);
  el.btnStop.addEventListener('click', () => {
    engine.stop();
    if (engine.mic.track) engine.mic.track.points.length = 0;
    updateReadouts(true);
  });

  el.btnSettings.addEventListener('click', () => {
    const open = el.settingsPanel.classList.contains('hidden');
    el.settingsPanel.classList.toggle('hidden', !open);
    el.btnSettings.setAttribute('aria-expanded', String(open));
  });
  el.settingsClose.addEventListener('click', () => {
    el.settingsPanel.classList.add('hidden');
    el.btnSettings.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.trackPanel.classList.contains('hidden')) {
      if (!el.trackPanel.contains(e.target) && !e.target.closest('[data-act="settings"]')) {
        closeTrackPanel();
      }
    }
    if (el.settingsPanel.classList.contains('hidden')) return;
    if (el.settingsPanel.contains(e.target) || el.btnSettings.contains(e.target)) return;
    el.settingsPanel.classList.add('hidden');
    el.btnSettings.setAttribute('aria-expanded', 'false');
  });

  el.rangeSelect.addEventListener('change', () => {
    state.settings.range = el.rangeSelect.value;
    applySettings();
    toast(t('toast.range'));
  });
  el.sensSelect.addEventListener('change', () => {
    state.settings.sensitivity = el.sensSelect.value;
    applySettings();
    toast(t('toast.sens'));
  });
  el.windowSelect.addEventListener('change', () => {
    state.settings.windowSec = Number(el.windowSelect.value);
    engine.settings.windowSec = state.settings.windowSec;
    saveSettings();
  });
  el.btnMode.addEventListener('click', () => {
    setLineMode(isFixedLine() ? 'follow' : 'fixed');
  });
  el.btnFollow.addEventListener('click', () => {
    setFollow(true);
    updateReadouts(true);
  });
  el.lineDragSelect.addEventListener('change', () => {
    state.settings.lineDrag = el.lineDragSelect.value;
    saveSettings();
    toast(t('toast.lineDrag'), 2600);
  });
  el.dbToggle.addEventListener('change', () => {
    state.settings.showDb = el.dbToggle.checked;
    saveSettings();
    applyDbVisibility();
    updateReadouts(true);
    toast(t(state.settings.showDb ? 'toast.dbOn' : 'toast.dbOff'), 2200);
  });
  el.settingsReanalyze.addEventListener('click', () => {
    el.settingsPanel.classList.add('hidden');
    el.btnSettings.setAttribute('aria-expanded', 'false');
    reanalyzeAll();
  });
  el.progressCancel.addEventListener('click', () => {
    if (state.cancelToken) state.cancelToken.cancelled = true;
  });

  el.tracks.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const act = btn.dataset.act;

    if (id === 'mic') {
      if (act === 'remove') toggleMic();
      return;
    }
    const track = engine.fileTracks.find((t) => t.id === id);
    if (!track) return;

    if (act === 'settings') {
      openTrackPanel(id);
      return;
    } else if (act === 'visible') {
      engine.setVisible(id, !track.visible);
    } else if (act === 'mute') {
      engine.setMuted(id, !track.muted);
    } else if (act === 'remove') {
      const wasLast = engine.fileTracks.length === 1;
      engine.removeTrack(id);
      if (wasLast) resetMicTimeline();
      if (engine.duration === 0) engine.stop();
    }
    refreshTracks();
    resize();
  });

  // ---- canvas gestures -------------------------------------------------
  // Follow mode: drag the graph = pan the viewport; drag the line = seek.
  // Fixed-line mode: drag the graph = scroll the score under the line;
  // drag the line = only move the line on screen.
  const clampTime = (t) => Math.max(0, Math.min(t, engine.duration));
  const hitRadius = (e) => (e.pointerType === 'touch' ? 22 : 10);

  function lineScreenPos() {
    const rect = el.view.getBoundingClientRect();
    const view = state.view;
    const g = geometry(rect.width, rect.height, view);
    const head = state.scrubTime ?? state.dragTime ?? (view.hasFiles ? engine.position : state.micClock);
    const px = g.x(head);
    return { rect, view, g, px, visible: px >= g.pad.left && px <= g.pad.left + g.plotW };
  }

  function nearLine(e, pos = lineScreenPos()) {
    return pos.visible && Math.abs(e.clientX - pos.rect.left - pos.px) <= hitRadius(e);
  }

  function pianoHit(e) {
    const rect = el.view.getBoundingClientRect();
    const g = geometry(rect.width, rect.height, state.view);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || x > g.pad.left - 2) return null;
    if (y < g.pad.top || y > g.pad.top + g.plotH) return null;
    const midi = Math.round(g.midiHi - ((y - g.pad.top) / g.plotH) * (g.midiHi - g.midiLo));
    if (midi < g.midiLo || midi > g.midiHi) return null;
    return { midi };
  }

  el.view.addEventListener('pointermove', (e) => {
    if (state.piano.pointerId != null) {
      if (e.pointerId !== state.piano.pointerId) return;
      const hit = pianoHit(e);
      if (hit && hit.midi !== state.piano.activeMidi) {
        state.piano.activeMidi = hit.midi;
        engine.playPiano(hit.midi);
      }
      return;
    }

    const drag = state.drag;
    if (!drag) {
      const key = pianoHit(e);
      state.piano.hoverMidi = key ? key.midi : null;
      el.view.classList.toggle('keyboard-hover', !!key);
      el.view.classList.toggle('line-hover', !key && nearLine(e));
      return;
    }
    if (e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) drag.moved = true;
    if (!drag.moved) return;

    if (drag.mode === 'line-fixed') {
      const frac = clampFrac((e.clientX - drag.rectLeft - drag.padLeft) / drag.plotW);
      state.headFrac = frac;
      if (drag.behavior === 'scroll') {
        // The live view keeps following the played position, so the score
        // moves while the line is repositioned.
        state.scrubTime = null;
      } else {
        state.scrubTime = clampTime(drag.frozenT0 + frac * drag.span);
      }
      el.view.classList.add('line-dragging');
      updateReadouts(true);
      return;
    }

    if (drag.mode === 'line-seek') {
      state.scrubTime = clampTime(timeAtClientX(e.clientX));
      el.view.classList.add('line-dragging');
      updateReadouts(true);
      return;
    }

    if (drag.mode === 'pan') {
      state.follow = false;
      const maxT0 = Math.max(0, engine.duration - drag.span);
      const t0 = Math.min(Math.max(0, drag.startT0 - (dx / drag.plotW) * drag.span), maxT0);
      state.manualView = { t0 };
      el.view.classList.add('panning');
      updateFollowButton();
      updateReadouts(true);
      return;
    }

    // Fixed-line mode: drag the graph itself.
    if (!drag.paused && engine.playing) {
      engine.pause();
      drag.startPos = engine.position;
    }
    drag.paused = true;
    el.view.classList.add('panning');
    state.scrubTime = clampTime(drag.startPos - (dx / drag.plotW) * drag.span);
    updateReadouts(true);
  });

  el.view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const key = pianoHit(e);
    if (key) {
      el.view.setPointerCapture(e.pointerId);
      state.piano.pointerId = e.pointerId;
      state.piano.activeMidi = key.midi;
      state.piano.hoverMidi = key.midi;
      engine.playPiano(key.midi);
      return;
    }

    if (!engine.fileTracks.length) return;
    const pos = lineScreenPos();
    const onLine = nearLine(e, pos);
    el.view.setPointerCapture(e.pointerId);
    el.view.classList.remove('line-hover');
    const base = {
      pointerId: e.pointerId,
      x: e.clientX,
      moved: false,
      span: pos.view.t1 - pos.view.t0,
      plotW: pos.g.plotW,
      wasPlaying: engine.playing,
    };

    if (onLine) {
      if (isFixedLine()) {
        const behavior = ['freeze', 'scroll', 'pause'].includes(state.settings.lineDrag)
          ? state.settings.lineDrag
          : 'freeze';
        state.drag = {
          ...base,
          mode: 'line-fixed',
          behavior,
          frozenT0: pos.view.t0,
          padLeft: pos.g.pad.left,
          rectLeft: pos.rect.left,
        };
        if (behavior !== 'scroll') {
          state.frozenView = { t0: pos.view.t0, t1: pos.view.t1 };
          state.scrubTime = clampTime(pos.view.t0 + state.headFrac * (pos.view.t1 - pos.view.t0));
        }
        if (behavior === 'pause' && engine.playing) engine.pause();
      } else {
        state.drag = { ...base, mode: 'line-seek' };
        state.follow = false;
        state.manualView = { t0: pos.view.t0 };
        state.scrubTime = clampTime(timeAtClientX(e.clientX));
        if (engine.playing) engine.pause();
        updateFollowButton();
      }
      updateReadouts(true);
      return;
    }

    if (isFixedLine()) {
      state.drag = { ...base, mode: 'graph', paused: false, startPos: engine.position };
    } else {
      state.drag = { ...base, mode: 'pan', startT0: pos.view.t0 };
    }
  });

  function endCanvasGesture(e) {
    if (state.piano.pointerId != null) {
      state.piano.pointerId = null;
      state.piano.activeMidi = null;
      engine.stopPiano(0.32);
      return;
    }
    const drag = state.drag;
    if (!drag) return;
    state.drag = null;
    el.view.classList.remove('panning', 'line-dragging');

    if (drag.mode === 'line-fixed') {
      // The line keeps the new screen position. Playback position is untouched;
      // the view realigns on the next frame (freeze/pause) or keeps scrolling.
      state.frozenView = null;
      state.scrubTime = null;
      if (drag.behavior === 'pause' && drag.wasPlaying) engine.play();
      saveSettings();
    } else if (drag.mode === 'line-seek') {
      const t = state.scrubTime;
      state.scrubTime = null;
      if (drag.moved && t != null) doSeek(t);
      setFollow(true);
      if (drag.wasPlaying) engine.play();
    } else if (drag.mode === 'pan') {
      if (!drag.moved && e && Number.isFinite(e.clientX)) {
        doSeek(clampTime(timeAtClientX(e.clientX)));
        setFollow(true);
      }
    } else if (drag.mode === 'graph') {
      if (drag.moved) {
        const t = state.scrubTime;
        state.scrubTime = null;
        if (t != null) engine.seek(t);
        if (drag.wasPlaying) engine.play();
      } else {
        state.scrubTime = null;
        if (e && Number.isFinite(e.clientX)) doSeek(clampTime(timeAtClientX(e.clientX)));
      }
    }
    updateFollowButton();
    updateReadouts(true);
  }

  el.view.addEventListener('pointerup', endCanvasGesture);
  el.view.addEventListener('pointercancel', () => {
    if (state.piano.pointerId != null) {
      state.piano.pointerId = null;
      state.piano.activeMidi = null;
      engine.stopPiano(0.2);
      return;
    }
    const drag = state.drag;
    state.drag = null;
    state.scrubTime = null;
    state.frozenView = null;
    el.view.classList.remove('panning', 'line-dragging');
    if (!isFixedLine()) setFollow(true);
    if (drag?.wasPlaying && !engine.playing) engine.play();
  });
  el.view.addEventListener('pointerleave', () => {
    if (!state.drag) el.view.classList.remove('line-hover');
    if (state.piano.pointerId == null) state.piano.hoverMidi = null;
    el.view.classList.remove('keyboard-hover');
  });

  el.view.addEventListener(
    'wheel',
    (e) => {
      if (!engine.fileTracks.length) return;
      e.preventDefault();
      const view = currentView();
      const span = Math.max(1, view.t1 - view.t0);
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (isFixedLine()) {
        const head = state.scrubTime ?? state.dragTime ?? engine.position;
        doSeek(clampTime(head + (delta / 1000) * span));
      } else {
        const maxT0 = Math.max(0, engine.duration - span);
        const t0 = Math.min(Math.max(0, view.t0 + (delta / 1000) * span), maxT0);
        state.follow = false;
        state.manualView = { t0 };
        updateFollowButton();
      }
      updateReadouts(true);
    },
    { passive: false },
  );

  el.overview.addEventListener('pointerdown', (e) => {
    if (!engine.fileTracks.length) return;
    el.overview.setPointerCapture(e.pointerId);
    state.dragTime = overviewTimeAt(e.clientX);
  });
  el.overview.addEventListener('pointermove', (e) => {
    if (state.dragTime == null) return;
    state.dragTime = overviewTimeAt(e.clientX);
  });
  el.overview.addEventListener('pointerup', () => {
    if (state.dragTime == null) return;
    const t = state.dragTime;
    state.dragTime = null;
    doSeek(t);
    updateReadouts(true);
  });
  el.overview.addEventListener('pointercancel', () => {
    state.dragTime = null;
  });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    e.preventDefault();
    togglePlay();
  });

  window.addEventListener('resize', resize);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => resize());
    ro.observe(el.canvasBox);
    ro.observe(el.overview);
  }
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  loadSettings();
  applySettings();
  bindEvents();
  applyLanguage();
  resize();
  requestAnimationFrame((ts) => {
    state.lastTs = ts;
    requestAnimationFrame(frame);
  });

  if (!window.isSecureContext) {
    setTimeout(() => toast(t('mic.insecureBoot'), 6000), 800);
  }

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is optional */
    });
  }

  const params = new URLSearchParams(location.search);
  if (params.has('demo')) {
    addDemo();
  }

  window.__pitchscope = { engine, state, addFiles, addDemo };
}

boot();
