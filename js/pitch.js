// YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002),
// with the difference function accelerated by FFT-based autocorrelation.
import { getFFT, nextPow2 } from './fft.js';

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Nearest equal-tempered note plus the deviation in cents. */
export function describeNote(freq) {
  const midiFloat = freqToMidi(freq);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { midi, name: `${name}${octave}`, cents, pitchClass: name, octave };
}

export class PitchDetector {
  /**
   * @param {object} opts
   * @param {number} opts.sampleRate
   * @param {number} [opts.minFreq] lowest expected F0 (Hz)
   * @param {number} [opts.maxFreq] highest expected F0 (Hz)
   * @param {number} [opts.windowSize] analysis frame length in samples (power of two)
   * @param {number} [opts.threshold] YIN absolute threshold (0.05–0.3)
   * @param {number} [opts.minClarity] reject results below this clarity (1 - cmnd)
   */
  constructor({
    sampleRate,
    minFreq = 65,
    maxFreq = 1200,
    windowSize = 1024,
    threshold = 0.15,
    minClarity = 0.5,
  }) {
    if (!sampleRate || sampleRate < 4000) throw new Error('Invalid sample rate');
    this.sampleRate = sampleRate;
    this.minFreq = Math.max(20, minFreq);
    this.maxFreq = Math.min(maxFreq, sampleRate * 0.45);
    this.windowSize = windowSize;
    this.threshold = threshold;
    this.minClarity = minClarity;

    this.fftSize = nextPow2(windowSize * 2);
    this.fft = getFFT(this.fftSize);
    this.re = new Float64Array(this.fftSize);
    this.im = new Float64Array(this.fftSize);
    this.power = new Float64Array(this.fftSize);
    this.prefix = new Float64Array(windowSize + 1);
    this.diff = new Float64Array(Math.floor(windowSize / 2) + 2);
    this.cmnd = new Float64Array(Math.floor(windowSize / 2) + 2);

    this.tauMin = Math.max(2, Math.floor(sampleRate / this.maxFreq));
    this.tauMax = Math.min(
      Math.floor(sampleRate / this.minFreq),
      Math.floor(windowSize / 2),
    );
    if (this.tauMax <= this.tauMin) throw new Error('Frequency range too narrow for window size');
  }

  /**
   * @param {Float32Array|Float64Array} frame exactly windowSize samples
   * @returns {{freq:number, clarity:number, rms:number, midi:number}|null}
   */
  detect(frame) {
    const W = this.windowSize;
    if (!frame || frame.length < W) return null;

    // Remove DC and measure level.
    let mean = 0;
    for (let i = 0; i < W; i++) mean += frame[i];
    mean /= W;

    let energy = 0;
    for (let i = 0; i < W; i++) {
      const v = frame[i] - mean;
      this.re[i] = v;
      this.im[i] = 0;
      this.prefix[i + 1] = this.prefix[i] + v * v;
      energy += v * v;
    }
    const rms = Math.sqrt(energy / W);
    if (rms < 1e-4) return null;

    const N = this.fftSize;
    for (let i = W; i < N; i++) {
      this.re[i] = 0;
      this.im[i] = 0;
    }

    // Autocorrelation r[tau] = IFFT(|X|^2) / N.
    this.fft.forward(this.re, this.im);
    for (let k = 0; k < N; k++) {
      const rr = this.re[k];
      const ii = this.im[k];
      this.re[k] = rr * rr + ii * ii;
      this.im[k] = 0;
    }
    this.fft.inverse(this.re, this.im);
    const ac = this.re;

    const e0 = this.prefix[W];
    const diff = this.diff;
    const cmnd = this.cmnd;
    const tauMax = this.tauMax;

    for (let tau = 0; tau <= tauMax; tau++) {
      // d(tau) = sum_{j<W-tau} x_j^2 + sum_{j>=tau} x_j^2 - 2*r(tau)
      let d = this.prefix[W - tau] + (e0 - this.prefix[tau]) - 2 * ac[tau];
      if (d < 0) d = 0;
      diff[tau] = d;
    }

    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += diff[tau];
      cmnd[tau] = running > 1e-12 ? (diff[tau] * tau) / running : 1;
    }

    let tau = -1;
    for (let t = this.tauMin; t <= tauMax; t++) {
      if (cmnd[t] < this.threshold) {
        // Follow the local minimum that the threshold landed on.
        while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      let best = this.tauMin;
      for (let t = this.tauMin; t <= tauMax; t++) {
        if (cmnd[t] < cmnd[best]) best = t;
      }
      tau = best;
    }

    const clarity = 1 - cmnd[tau];
    if (clarity < this.minClarity) {
      return { freq: 0, clarity, rms, midi: 0 };
    }

    // Parabolic interpolation around the chosen lag.
    let refined = tau;
    if (tau > this.tauMin && tau < tauMax) {
      const s0 = cmnd[tau - 1];
      const s1 = cmnd[tau];
      const s2 = cmnd[tau + 1];
      const denom = 2 * (2 * s1 - s0 - s2);
      if (Math.abs(denom) > 1e-12) {
        const delta = (s2 - s0) / denom;
        if (delta > -1 && delta < 1) refined = tau + delta;
      }
    }
    if (refined <= 0) return null;

    const freq = this.sampleRate / refined;
    if (!Number.isFinite(freq) || freq < this.minFreq * 0.98 || freq > this.maxFreq * 1.02) {
      return { freq: 0, clarity, rms, midi: 0 };
    }

    return { freq, clarity, rms, midi: freqToMidi(freq) };
  }
}
