// Minimal iterative radix-2 FFT, enough for real-time YIN pitch detection.
const cache = new Map();

export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export class FFT {
  constructor(n) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two');
    this.n = n;
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let x = i;
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const a = (2 * Math.PI * i) / n;
      this.cos[i] = Math.cos(a);
      this.sin[i] = Math.sin(a);
    }
  }

  forward(re, im) {
    const n = this.n;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    const cos = this.cos;
    const sin = this.sin;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let base = 0; base < n; base += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = base + j;
          const b = a + half;
          const c = cos[k];
          const s = sin[k];
          const bre = re[b];
          const bim = im[b];
          const tre = bre * c + bim * s;
          const tim = -bre * s + bim * c;
          re[b] = re[a] - tre;
          im[b] = im[a] - tim;
          re[a] += tre;
          im[a] += tim;
        }
      }
    }
  }

  inverse(re, im) {
    const n = this.n;
    for (let i = 0; i < n; i++) im[i] = -im[i];
    this.forward(re, im);
    const scale = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= scale;
      im[i] = -im[i] * scale;
    }
  }
}

export function getFFT(n) {
  let fft = cache.get(n);
  if (!fft) {
    fft = new FFT(n);
    cache.set(n, fft);
  }
  return fft;
}
