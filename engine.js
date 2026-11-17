// Audio engine: file decoding, offline pitch analysis, multi-track playback,
// and microphone capture. No frameworks, Web Audio only.
import { PitchDetector, midiToFreq } from './pitch.js';

export const FILE_SAMPLE_RATE = 16000; // analysis rate for imported audio
const MAX_DURATION = 10 * 60; // seconds

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.tracks = [];
    this.mic = {
      active: false,
      stream: null,
      source: null,
      analyser: null,
      data: null,
      track: null,
      error: null,
    };
    this.transport = { playing: false, offset: 0, startedAt: 0, sources: [] };
    this.settings = {
      minFreq: 65,
      maxFreq: 1600,
      threshold: 0.15,
      minClarity: 0.5,
      windowSec: 10,
    };
    this._detectors = new Map();
    this._id = 0;
    this.pianoVoice = null;
    this._pianoWave = null;
  }

  async init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('当前浏览器不支持 Web Audio');
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  async resume() {
    await this.init();
    if (this.ctx.state !== 'running') {
      try {
        await Promise.race([
          this.ctx.resume().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 200)),
        ]);
      } catch {
        /* user gesture may still be required */
      }
    }
  }

  get fileTracks() {
    return this.tracks.filter((t) => t.kind === 'file');
  }

  get duration() {
    return this.fileTracks.reduce((max, t) => Math.max(max, this.trackDuration(t)), 0);
  }

  trackDuration(track) {
    return track.duration / Math.max(0.25, track.speed || 1);
  }

  /** Display-time pitch curve after speed / pitch-preservation is applied. */
  buildView(track) {
    const speed = Math.max(0.25, track.speed || 1);
    const pitchScale = track.preservePitch ? 1 : speed;
    const { times, freqs, clarity } = track.analysis;
    const outT = new Float32Array(times.length);
    const outF = new Float32Array(freqs.length);
    for (let i = 0; i < times.length; i++) {
      outT[i] = times[i] / speed;
      outF[i] = freqs[i] > 0 ? freqs[i] * pitchScale : 0;
    }
    track.view = { times: outT, freqs: outF, clarity };
  }

  _applyGain(track) {
    const target = track.muted ? 0 : 0.9 * (track.volume ?? 1);
    track.gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
  }

  get playing() {
    return this.transport.playing;
  }

  get position() {
    const { playing, offset, startedAt } = this.transport;
    if (!playing || !this.ctx) return Math.min(offset, this.duration);
    const p = offset + (this.ctx.currentTime - startedAt);
    return Math.min(p, this.duration);
  }

  /** Detector for a given sample rate + current settings, cached per rate. */
  detector(sampleRate) {
    const s = this.settings;
    const windowSize = sampleRate >= 32000 ? 4096 : 1024;
    const key = `${sampleRate}|${windowSize}|${s.minFreq}|${s.maxFreq}|${s.threshold}|${s.minClarity}`;
    let detector = this._detectors.get(key);
    if (!detector) {
      detector = new PitchDetector({
        sampleRate,
        windowSize,
        minFreq: s.minFreq,
        maxFreq: s.maxFreq,
        threshold: s.threshold,
        minClarity: s.minClarity,
      });
      if (this._detectors.size > 6) this._detectors.clear();
      this._detectors.set(key, detector);
    }
    return detector;
  }

  /**
   * Decode a user file and analyze its pitch curve.
   * @param {File} file
   * @param {{color:string, onProgress?:(ratio:number)=>void, token?:{cancelled:boolean}}} opts
   */
  async addFile(file, { color, onProgress, token } = {}) {
    await this.resume();
    if (file.size > 120 * 1024 * 1024) throw new Error('文件过大（>120MB）');

    let buffer;
    try {
      const bytes = await file.arrayBuffer();
      buffer = await this.ctx.decodeAudioData(bytes);
    } catch {
      throw new Error(`无法解码「${file.name}」，请换 MP3 / WAV / M4A / OGG 格式`);
    }
    if (buffer.duration > MAX_DURATION) throw new Error('音频超过 10 分钟，暂不支持');

    const analysis = await this._analyze(buffer, onProgress, token);

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0.9;
    gainNode.connect(this.master);

    const track = {
      id: `f${++this._id}`,
      kind: 'file',
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || '音频',
      color: color || '#22d3ee',
      buffer,
      duration: buffer.duration,
      analysis,
      visible: true,
      muted: false,
      gainNode,
      volume: 1,
      speed: 1,
      preservePitch: true,
      stretched: null,
    };
    this.buildView(track);
    this.tracks.push(track);
    return track;
  }

  /** Re-run pitch analysis with the current detector settings. */
  async reanalyze(track, onProgress, token) {
    if (!track?.buffer) return null;
    const analysis = await this._analyze(track.buffer, onProgress, token);
    track.analysis = analysis;
    this.buildView(track);
    return analysis;
  }

  resetDetectors() {
    this._detectors.clear();
  }

  /** Synthesize a short melody so the app can be tried without a file. */
  async addDemo(color = '#22d3ee') {
    await this.resume();
    const sr = this.ctx.sampleRate;
    const notes = [60, 62, 64, 67, 69, 67, 64, 62, 60, 67, 72, 67, 64, 60];
    const step = 0.52;
    const total = notes.length * step + 0.6;
    const buffer = this.ctx.createBuffer(1, Math.ceil(total * sr), sr);
    const data = buffer.getChannelData(0);
    let phase = 0;
    notes.forEach((midi, i) => {
      const f0 = midiToFreq(midi);
      const start = Math.floor((i * step + 0.04) * sr);
      const len = Math.floor((step - 0.06) * sr);
      for (let n = 0; n < len && start + n < data.length; n++) {
        const t = n / sr;
        const env = Math.min(1, t / 0.025) * Math.exp(-t * 2.4);
        const vibrato = 1 + 0.006 * Math.sin(2 * Math.PI * 5.1 * t);
        phase += (2 * Math.PI * f0 * vibrato) / sr;
        const v = Math.sin(phase) + 0.35 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase);
        data[start + n] = v * 0.2 * env;
      }
    });

    const analysis = await this._analyze(buffer);
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0.9;
    gainNode.connect(this.master);

    const track = {
      id: `f${++this._id}`,
      kind: 'file',
      name: '示例旋律（C 大调）',
      color,
      buffer,
      duration: buffer.duration,
      analysis,
      visible: true,
      muted: false,
      gainNode,
      volume: 1,
      speed: 1,
      preservePitch: true,
      stretched: null,
    };
    this.buildView(track);
    this.tracks.push(track);
    return track;
  }

  async _analyze(buffer, onProgress, token) {
    const sr = FILE_SAMPLE_RATE;
    const length = Math.max(1, Math.ceil(buffer.duration * sr));
    const offline = new OfflineAudioContext(1, length, sr);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    const data = rendered.getChannelData(0);

    const W = 1024;
    const hop = 512;
    const detector = this.detector(sr);
    const count = Math.max(1, Math.floor((data.length - W) / hop) + 1);
    const times = new Float32Array(count);
    const freqs = new Float32Array(count);
    const clarity = new Float32Array(count);
    const levels = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      if (token?.cancelled) throw new Error('已取消');
      const frame = data.subarray(i * hop, i * hop + W);
      const result = detector.detect(frame);
      times[i] = (i * hop + W / 2) / sr;
      if (result) levels[i] = result.rms;
      if (result && result.freq > 0) {
        freqs[i] = result.freq;
        clarity[i] = result.clarity;
      }
      if (i % 200 === 0) {
        onProgress?.(i / count);
        await yieldToBrowser();
      }
    }

    // Drop isolated frames that jump more than 3 semitones away from both
    // neighbours. These are almost always octave errors at note transitions.
    const toMidi = (f) => 69 + 12 * Math.log2(f / 440);
    for (let i = 1; i < count - 1; i++) {
      if (!freqs[i] || !freqs[i - 1] || !freqs[i + 1]) continue;
      const m = toMidi(freqs[i]);
      if (
        Math.abs(m - toMidi(freqs[i - 1])) > 3 &&
        Math.abs(m - toMidi(freqs[i + 1])) > 3
      ) {
        freqs[i] = 0;
        clarity[i] = 0;
      }
    }

    onProgress?.(1);
    return { times, freqs, clarity, levels, hop, sampleRate: sr, frameSize: W };
  }

  removeTrack(id) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return;
    if (track.kind === 'file') {
      this._stopSourceFor(id);
      track.gainNode?.disconnect();
    }
    this.tracks = this.tracks.filter((t) => t.id !== id);
    if (!this.fileTracks.length) {
      this.transport.playing = false;
      this.transport.offset = 0;
    } else if (this.transport.offset > this.duration) {
      this.transport.offset = this.duration;
    }
  }

  _stopSourceFor(trackId) {
    for (const entry of this.transport.sources) {
      if (entry.trackId === trackId) {
        try {
          entry.node.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    this.transport.sources = this.transport.sources.filter((e) => e.trackId !== trackId);
  }

  async play() {
    await this.resume();
    if (!this.fileTracks.length) return false;
    if (this.transport.playing) return true;

    let offset = this.transport.offset;
    if (offset >= this.duration - 0.03) offset = 0;

    this.transport.offset = offset;
    this.transport.startedAt = this.ctx.currentTime;
    this.transport.playing = true;
    this.transport.sources = [];

    for (const track of this.fileTracks) {
      const speed = Math.max(0.25, track.speed || 1);
      const buffer = track.preservePitch && track.stretched ? track.stretched : track.buffer;
      const srcOffset = track.preservePitch ? offset : offset * speed;
      if (!track.visible || srcOffset >= buffer.duration - 1e-3) continue;
      const node = this.ctx.createBufferSource();
      node.buffer = buffer;
      node.playbackRate.value = track.preservePitch ? 1 : speed;
      node.connect(track.gainNode);
      try {
        node.start(0, srcOffset);
        this.transport.sources.push({ trackId: track.id, node });
      } catch {
        /* ignore a track that cannot start */
      }
    }
    return true;
  }

  pause() {
    if (!this.transport.playing) return;
    this.transport.offset = this.position;
    this.transport.playing = false;
    for (const entry of this.transport.sources) {
      entry.node.onended = null;
      try {
        entry.node.stop();
      } catch {
        /* ignore */
      }
    }
    this.transport.sources = [];
  }

  stop() {
    this.pause();
    this.transport.offset = 0;
  }

  seek(seconds) {
    const target = Math.max(0, Math.min(seconds, this.duration));
    if (this.transport.playing) {
      this.pause();
      this.transport.offset = target;
      this.play();
    } else {
      this.transport.offset = target;
    }
  }

  setMuted(id, muted) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track || track.kind !== 'file') return;
    track.muted = muted;
    this._applyGain(track);
    if (this.transport.playing) {
      if (muted) {
        this._stopSourceFor(id);
      } else if (!this.transport.sources.some((e) => e.trackId === id)) {
        const speed = Math.max(0.25, track.speed || 1);
        const buffer = track.preservePitch && track.stretched ? track.stretched : track.buffer;
        const srcOffset = track.preservePitch ? this.position : this.position * speed;
        if (srcOffset < buffer.duration) {
          const node = this.ctx.createBufferSource();
          node.buffer = buffer;
          node.playbackRate.value = track.preservePitch ? 1 : speed;
          node.connect(track.gainNode);
          node.start(0, srcOffset);
          this.transport.sources.push({ trackId: id, node });
        }
      }
    }
  }

  setVisible(id, visible) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return;
    track.visible = visible;
  }

  setTrackVolume(id, volume) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track || track.kind !== 'file') return;
    track.volume = Math.max(0, Math.min(1.5, volume));
    this._applyGain(track);
  }

  applyTrackSpeed(id, speed, preservePitch) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track || track.kind !== 'file') return;
    const wasPlaying = this.transport.playing;
    const pos = this.position;
    if (wasPlaying) this.pause();

    track.speed = Math.max(0.25, Math.min(4, speed || 1));
    track.preservePitch = !!preservePitch;
    track.stretched =
      track.preservePitch && Math.abs(track.speed - 1) > 0.001
        ? this._stretch(track.buffer, track.speed)
        : null;
    this.buildView(track);

    this.transport.offset = Math.min(pos, this.duration);
    if (wasPlaying) this.play();
  }

  async addBufferTrack(buffer, { name = '音频', color = '#38e0d0', volume = 1, muted = false, onProgress } = {}) {
    await this.resume();
    const analysis = await this._analyze(buffer, onProgress);
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = muted ? 0 : 0.9 * volume;
    gainNode.connect(this.master);
    const track = {
      id: `f${++this._id}`,
      kind: 'file',
      name,
      color,
      buffer,
      duration: buffer.duration,
      analysis,
      visible: true,
      muted,
      gainNode,
      volume,
      speed: 1,
      preservePitch: true,
      stretched: null,
    };
    this.buildView(track);
    this.tracks.push(track);
    return track;
  }

  async renderTrackWav(id) {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) return null;
    const speed = Math.max(0.25, track.speed || 1);
    if (Math.abs(speed - 1) < 0.001) return bufferToWav(track.buffer);
    if (track.preservePitch && track.stretched) return bufferToWav(track.stretched);

    const sr = this.ctx.sampleRate;
    const length = Math.max(1, Math.ceil((track.buffer.length / speed) * (sr / track.buffer.sampleRate)));
    const offline = new OfflineAudioContext(1, length, sr);
    const source = offline.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.value = speed;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return bufferToWav(rendered);
  }

  async startRecording() {
    await this.resume();
    if (!this.mic.active) await this.enableMic();
    if (this.rec) return this.rec;

    const ctx = this.ctx;
    const makeTap = () => {
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const sink = ctx.createGain();
      sink.gain.value = 0;
      proc.connect(sink);
      sink.connect(ctx.destination);
      return { proc, sink };
    };

    const micTap = makeTap();
    const backTap = makeTap();
    try {
      this.mic.source.connect(micTap.proc);
      this.master.connect(backTap.proc);
    } catch {
      /* ignore */
    }

    const rec = {
      mic: [],
      back: [],
      sampleRate: ctx.sampleRate,
      startedAt: performance.now(),
      nodes: [micTap, backTap],
    };
    this.rec = rec;
    micTap.proc.onaudioprocess = (e) => {
      if (this.rec !== rec) return;
      rec.mic.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    backTap.proc.onaudioprocess = (e) => {
      if (this.rec !== rec) return;
      rec.back.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    return rec;
  }

  stopRecording() {
    const rec = this.rec;
    if (!rec) return null;
    this.rec = null;
    for (const node of rec.nodes) {
      try {
        node.proc.disconnect();
        node.sink.disconnect();
      } catch {
        /* ignore */
      }
    }

    const total = (chunks) => chunks.reduce((n, c) => n + c.length, 0);
    const minLen = Math.min(total(rec.mic), total(rec.back));
    if (!minLen) return null;

    const toArray = (chunks, len) => {
      const out = new Float32Array(len);
      let offset = 0;
      for (const chunk of chunks) {
        if (offset >= len) break;
        const take = Math.min(chunk.length, len - offset);
        out.set(chunk.subarray(0, take), offset);
        offset += take;
      }
      return out;
    };

    const sr = rec.sampleRate;
    const micData = toArray(rec.mic, minLen);
    const backData = toArray(rec.back, minLen);
    const mixData = new Float32Array(minLen);
    for (let i = 0; i < minLen; i++) {
      mixData[i] = Math.max(-1, Math.min(1, (micData[i] + backData[i]) * 0.85));
    }

    const ctx = this.ctx;
    const makeBuffer = (data) => {
      const b = ctx.createBuffer(1, data.length, sr);
      b.copyToChannel(data, 0);
      return b;
    };
    return {
      mic: makeBuffer(micData),
      backing: makeBuffer(backData),
      mix: makeBuffer(mixData),
      duration: minLen / sr,
      sampleRate: sr,
    };
  }

  _pianoPeriodicWave() {
    if (this._pianoWave) return this._pianoWave;
    const n = 12;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const amps = [0, 1, 0.55, 0.32, 0.2, 0.12, 0.08, 0.05, 0.03, 0.02, 0.015, 0.01];
    for (let i = 1; i < n; i++) imag[i] = amps[i] || 0;
    this._pianoWave = this.ctx.createPeriodicWave(real, imag);
    return this._pianoWave;
  }

  async playPiano(midi) {
    await this.resume();
    this.stopPiano(0.05);
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = midiToFreq(midi);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this._pianoPeriodicWave());
    osc.frequency.setValueAtTime(freq, now);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(9000, 1200 + freq * 7), now);
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    this.pianoVoice = { osc, filter, gain };
    osc.onended = () => {
      if (this.pianoVoice?.osc === osc) this.pianoVoice = null;
    };
  }

  stopPiano(release = 0.28) {
    const voice = this.pianoVoice;
    if (!voice) return;
    this.pianoVoice = null;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, Math.max(0.02, release / 4));
    try {
      voice.osc.stop(now + release);
    } catch {
      /* already stopped */
    }
    setTimeout(() => {
      try {
        voice.osc.disconnect();
        voice.filter.disconnect();
        voice.gain.disconnect();
      } catch {
        /* ignore */
      }
    }, (release + 0.2) * 1000);
  }

  async enableMic() {
    await this.resume();
    if (this.mic.active) return this.mic.track;
    if (!window.isSecureContext) {
      const err = new Error('麦克风需要 HTTPS 或 localhost');
      err.name = 'InsecureContext';
      throw err;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('浏览器不支持麦克风采集');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);
    // Keep the graph alive without monitoring the mic (no feedback).
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(this.ctx.destination);

    this.mic = {
      active: true,
      stream,
      source,
      analyser,
      data: new Float32Array(analyser.fftSize),
      error: null,
      track: {
        id: 'mic',
        kind: 'mic',
        name: '麦克风',
        color: '#fb7185',
        points: [],
        visible: true,
        muted: false,
      },
      sink,
    };
    this.detector(this.ctx.sampleRate);
    return this.mic.track;
  }

  /** OLA time-stretch: same pitch, duration divided by speed. */
  _stretch(buffer, speed) {
    const frame = 2048;
    const hopOut = 512;
    const outLen = Math.max(1, Math.ceil(buffer.length / speed));
    const out = this.ctx.createBuffer(buffer.numberOfChannels, outLen, buffer.sampleRate);
    const win = new Float32Array(frame);
    for (let i = 0; i < frame; i++) {
      win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frame - 1));
    }

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      const norm = new Float32Array(outLen);
      let inPos = 0;
      const hopIn = Math.max(1, Math.round(hopOut * speed));
      for (let outPos = 0; outPos < outLen; outPos += hopOut) {
        for (let i = 0; i < frame; i++) {
          const di = outPos + i;
          const si = inPos + i;
          if (di >= outLen || si >= src.length) break;
          const w = win[i];
          dst[di] += src[si] * w;
          norm[di] += w;
        }
        inPos += hopIn;
      }
      for (let i = 0; i < outLen; i++) {
        if (norm[i] > 0.05) dst[i] /= norm[i];
      }
    }
    return out;
  }

  disableMic() {
    if (!this.mic.active) return;
    try {
      this.mic.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      this.mic.source?.disconnect();
      this.mic.analyser?.disconnect();
      this.mic.sink?.disconnect();
    } catch {
      /* ignore */
    }
    this.mic = {
      active: false,
      stream: null,
      source: null,
      analyser: null,
      data: null,
      track: null,
      error: null,
    };
  }

  readMic() {
    if (!this.mic.active || !this.mic.analyser) return null;
    this.mic.analyser.getFloatTimeDomainData(this.mic.data);
    try {
      return this.detector(this.ctx.sampleRate).detect(this.mic.data);
    } catch {
      return null;
    }
  }
}

/** Encode an AudioBuffer as a 16-bit PCM WAV Blob. */
export function bufferToWav(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const blockAlign = channels * 2;
  const dataSize = frames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const data = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
