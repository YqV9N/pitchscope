// Canvas rendering for the rolling pitch view and the whole-song overview.
import { freqToMidi } from './pitch.js';

const NOTE_GRID = 'rgba(140, 170, 210, 0.075)';
const OCTAVE_GRID = 'rgba(140, 180, 230, 0.18)';
const AXIS_TEXT = '#7089a8';
const PLAYHEAD = '#dbeafe';

function niceStep(span, target = 7) {
  const raw = span / target;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= raw) ?? 600;
}

function midiLabel(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function geometry(w, h, view) {
  const pad = { left: 54, right: 14, top: 20, bottom: 26 };
  const plotW = Math.max(20, w - pad.left - pad.right);
  const plotH = Math.max(20, h - pad.top - pad.bottom);
  const midiLo = Math.max(0, Math.floor(freqToMidi(view.fMin)) - 1);
  const midiHi = Math.max(midiLo + 12, Math.ceil(freqToMidi(view.fMax)) + 1);
  const span = Math.max(1e-6, view.t1 - view.t0);
  const x = (t) => pad.left + ((t - view.t0) / span) * plotW;
  const y = (midi) => pad.top + ((midiHi - midi) / (midiHi - midiLo)) * plotH;
  return { pad, plotW, plotH, midiLo, midiHi, x, y };
}

function strokeTyped(g, times, freqs, from, to, color, width) {
  const { x, y } = g;
  const ctx = g.ctx;
  ctx.beginPath();
  let pen = false;
  let lastX = -1e9;
  for (let i = from; i <= to; i++) {
    const f = freqs[i];
    if (!f) {
      pen = false;
      continue;
    }
    const px = x(times[i]);
    if (px < g.pad.left - 20 || px > g.pad.left + g.plotW + 20) {
      pen = false;
      continue;
    }
    // Skip sub-pixel steps to keep long files cheap to draw.
    if (pen && px - lastX < 0.6) continue;
    const py = y(freqToMidi(f));
    if (!pen) {
      ctx.moveTo(px, py);
      pen = true;
    } else {
      ctx.lineTo(px, py);
    }
    lastX = px;
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = width + 5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  ctx.stroke();
}

function strokePoints(g, pts, from, to, color, width) {
  const { x, y } = g;
  const ctx = g.ctx;
  ctx.beginPath();
  let pen = false;
  for (let i = from; i <= to; i++) {
    const p = pts[i];
    if (!p || !p.f) {
      pen = false;
      continue;
    }
    const px = x(p.t);
    const py = y(p.m);
    if (!pen) {
      ctx.moveTo(px, py);
      pen = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = width + 5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawFileSeries(g, track, viewStart, viewEnd) {
  const { times, freqs } = track.view || track.analysis;
  const n = times.length;
  if (!n) return;

  let lo = 0;
  let hi = n - 1;
  let start = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < viewStart) {
      start = mid + 1;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  start = Math.max(0, start - 1);

  let end = n - 1;
  while (end > start && times[end] > viewEnd) end--;

  strokeTyped(g, times, freqs, start, end, track.color, 2.2);
}

function drawMicSeries(g, points, viewStart, viewEnd) {
  if (!points.length) return;
  let i = points.length - 1;
  while (i >= 0 && points[i].t >= viewStart) i--;
  const start = Math.max(0, i + 1, points.length - 5000);
  let end = points.length - 1;
  while (end >= start && points[end].t > viewEnd) end--;
  strokePoints(g, points, start, end, '#fb7185', 2.2);
}


function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

function drawKeyboard(ctx, g, state) {
  const { pad, plotH, midiLo, midiHi } = g;
  const keyW = pad.left - 2;
  const rowH = plotH / (midiHi - midiLo);
  const active = state.piano?.activeMidi ?? null;
  const hover = state.piano?.hoverMidi ?? null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, pad.top, pad.left, plotH);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, keyW, 0);
  bg.addColorStop(0, '#e9eff7');
  bg.addColorStop(0.75, '#cfdae8');
  bg.addColorStop(1, '#b9c8da');
  ctx.fillStyle = bg;
  ctx.fillRect(0, pad.top, keyW, plotH);

  ctx.strokeStyle = 'rgba(40, 58, 80, 0.16)';
  ctx.lineWidth = 1;
  for (let m = midiLo; m <= midiHi + 1; m++) {
    const y = g.y(m - 0.5);
    if (y < pad.top || y > pad.top + plotH) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(keyW, y);
    ctx.stroke();
  }

  if (active != null && !isBlackKey(active)) {
    const yc = g.y(active);
    ctx.fillStyle = '#5eead4';
    ctx.fillRect(0, yc - rowH / 2, keyW, rowH);
  }
  if (hover != null && !isBlackKey(hover) && hover !== active) {
    const yc = g.y(hover);
    ctx.fillStyle = 'rgba(56, 224, 208, 0.22)';
    ctx.fillRect(0, yc - rowH / 2, keyW, rowH);
  }

  for (let m = midiLo; m <= midiHi; m++) {
    if (!isBlackKey(m)) continue;
    const yc = g.y(m);
    const h = Math.max(2, rowH * 0.62);
    const x = keyW * 0.4;
    const w = keyW - x;
    ctx.fillStyle = m === active ? '#38d8c8' : m === hover ? '#29465c' : '#101c2d';
    ctx.fillRect(x, yc - h / 2, w, h);
    ctx.strokeStyle = 'rgba(5, 12, 22, 0.6)';
    ctx.strokeRect(x + 0.5, yc - h / 2 + 0.5, w - 1, h - 1);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
  for (let m = midiLo; m <= midiHi; m++) {
    if (((m % 12) + 12) % 12 !== 0) continue;
    const yc = g.y(m);
    if (yc < pad.top + 5 || yc > pad.top + plotH - 5) continue;
    ctx.fillStyle = m === active ? '#04302c' : '#31465e';
    ctx.fillText(midiLabel(m), 4, yc);
  }

  ctx.strokeStyle = 'rgba(120, 160, 200, 0.35)';
  ctx.beginPath();
  ctx.moveTo(keyW + 0.5, pad.top);
  ctx.lineTo(keyW + 0.5, pad.top + plotH);
  ctx.stroke();

  ctx.restore();
}

export function drawView(canvas, state) {
  const ctx = canvas.getContext('2d');
  const dpr = state.dpr;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const g = geometry(w, h, state);
  g.ctx = ctx;

  const { pad, plotW, plotH, midiLo, midiHi } = g;

  // Plot background
  const bg = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  bg.addColorStop(0, 'rgba(20, 32, 52, 0.55)');
  bg.addColorStop(1, 'rgba(8, 14, 26, 0.55)');
  ctx.fillStyle = bg;
  ctx.fillRect(pad.left, pad.top, plotW, plotH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();

  // Semitone + octave grid
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';
  for (let m = midiLo; m <= midiHi; m++) {
    const py = g.y(m);
    const isC = ((m % 12) + 12) % 12 === 0;
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + plotW, py);
    ctx.strokeStyle = isC ? OCTAVE_GRID : NOTE_GRID;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Time grid
  const viewSpan = state.t1 - state.t0;
  const step = niceStep(viewSpan);
  const firstTick = Math.ceil(state.t0 / step) * step;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let t = firstTick; t <= state.t1 + 1e-6; t += step) {
    const px = g.x(t);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + plotH);
    ctx.strokeStyle = NOTE_GRID;
    ctx.stroke();
    if (t < -1e-6) continue;
    if (Number.isFinite(state.duration) && t > state.duration + 1e-6) continue;
    ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(formatTick(t), px, pad.top + plotH + 7);
  }

  // Tracks (files first, mic on top)
  for (const track of state.tracks) {
    if (track.kind !== 'file' || !track.visible) continue;
    drawFileSeries(g, track, state.t0, state.t1);
  }
  if (state.micTrack?.visible) {
    drawMicSeries(g, state.micTrack.points, state.t0, state.t1);
  }

  // Mic tip marker (where "now" is when no file is loaded)
  const micPts = state.micTrack?.visible ? state.micTrack.points : null;
  if (micPts?.length) {
    const last = micPts[micPts.length - 1];
    if (last.t >= state.t0 && last.t <= state.t1) {
      ctx.beginPath();
      ctx.arc(g.x(last.t), g.y(last.m), 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fb7185';
      ctx.fill();
      ctx.strokeStyle = 'rgba(5, 10, 18, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Current pitch dots at the playhead
  for (const track of state.tracks) {
    if (track.kind !== 'file' || !track.visible) continue;
    const p = sampleTrack(track, state.playhead);
    if (p) {
      ctx.beginPath();
      ctx.arc(g.x(state.playhead), g.y(p.midi), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = track.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(5, 10, 18, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Playhead
  if (state.playhead >= state.t0 - 0.5 && state.playhead <= state.t1 + 0.5) {
    const px = g.x(state.playhead);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, pad.top + plotH);
    ctx.strokeStyle = PLAYHEAD;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(px - 5, pad.top);
    ctx.lineTo(px + 5, pad.top);
    ctx.lineTo(px, pad.top + 7);
    ctx.closePath();
    ctx.fillStyle = PLAYHEAD;
    ctx.fill();
  }

  ctx.restore();

  // Vertical piano keyboard in the left gutter
  drawKeyboard(ctx, g, state);

  // Border
  ctx.strokeStyle = 'rgba(120, 160, 210, 0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad.left, pad.top, plotW, plotH);
}

function formatTick(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Nearest voiced analysis sample for a file track (for readouts/dots). */
export function sampleTrack(track, time) {
  const data = track?.view || track?.analysis;
  if (!data) return null;
  const { times, freqs, clarity } = data;
  if (!times.length) return null;
  // binary search nearest
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = Math.max(0, lo - 2); i <= Math.min(times.length - 1, lo + 2); i++) {
    const dist = Math.abs(times[i] - time);
    if (dist < bestDist && freqs[i] > 0) {
      bestDist = dist;
      best = i;
    }
  }
  if (best < 0 || bestDist > 0.12) return null;
  return { freq: freqs[best], midi: freqToMidi(freqs[best]), clarity: clarity[best], time: times[best] };
}

export function drawOverview(canvas, state) {
  const ctx = canvas.getContext('2d');
  const dpr = state.dpr;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(11, 19, 33, 0.9)';
  ctx.fillRect(0, 0, w, h);

  const duration = state.duration;
  if (!duration) {
    ctx.fillStyle = AXIS_TEXT;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('导入音频后，这里显示整首音高轮廓', w / 2, h / 2);
    return;
  }

  const padY = 8;
  const midiLo = Math.floor(freqToMidi(state.fMin));
  const midiHi = Math.ceil(freqToMidi(state.fMax));
  const y = (midi) => h - padY - ((midi - midiLo) / Math.max(1, midiHi - midiLo)) * (h - padY * 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  for (const track of state.tracks) {
    if (track.kind !== 'file' || !track.visible) continue;
    const { times, freqs, clarity } = track.view || track.analysis;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < times.length; i++) {
      if (!freqs[i] || clarity[i] < 0.45) {
        pen = false;
        continue;
      }
      const px = (times[i] / duration) * w;
      const py = y(freqToMidi(freqs[i]));
      if (!pen) {
        ctx.moveTo(px, py);
        pen = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.strokeStyle = track.color;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const px = (state.playhead / duration) * w;
  const grad = ctx.createLinearGradient(0, 0, px, 0);
  grad.addColorStop(0, 'rgba(34, 211, 238, 0.05)');
  grad.addColorStop(1, 'rgba(34, 211, 238, 0.16)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, px, h);

  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, h);
  ctx.strokeStyle = PLAYHEAD;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Level (dBFS) at a given display time, regardless of pitch voicing. */
export function sampleLevel(track, time) {
  const data = track?.view || track?.analysis;
  const levels = track?.analysis?.levels;
  if (!data || !levels || !data.times.length) return null;
  const times = data.times;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < time) lo = mid + 1;
    else hi = mid;
  }
  let idx = lo;
  if (idx > 0 && Math.abs(times[idx - 1] - time) < Math.abs(times[idx] - time)) idx--;
  const rms = levels[idx] || 0;
  return rms > 1e-6 ? 20 * Math.log10(rms) : -60;
}
