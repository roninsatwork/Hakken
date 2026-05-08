const smoothingFactor = (t_e: number, cutoff: number) => {
  const r = 2 * Math.PI * cutoff * t_e;
  return r / (r + 1);
};

const exponentialSmoothing = (a: number, x: number, x_prev: number) => {
  return a * x + (1 - a) * x_prev;
};

export class OneEuroFilter {
  private freq: number;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private x_prev: number | null = null;
  private dx_prev: number = 0;
  private t_prev: number | null = null;

  constructor(freq = 30, minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(x: number, t: number = -1): number {
    if (this.x_prev === null || this.t_prev === null) {
      this.x_prev = x;
      this.t_prev = t === -1 ? performance.now() / 1000 : t;
      return x;
    }

    const t_e = t === -1 ? 1.0 / this.freq : t - this.t_prev;
    
    // Prevent division by zero if timestamps are identical
    if (t_e <= 0) return this.x_prev;

    // 1. Calculate the smoothed derivative of the signal
    const a_d = smoothingFactor(t_e, this.dCutoff);
    const dx = (x - this.x_prev) / t_e;
    const dx_hat = exponentialSmoothing(a_d, dx, this.dx_prev);

    // 2. Calculate the cutoff frequency
    const cutoff = this.minCutoff + this.beta * Math.abs(dx_hat);

    // 3. Calculate the smoothed signal
    const a = smoothingFactor(t_e, cutoff);
    const x_hat = exponentialSmoothing(a, x, this.x_prev);

    // 4. Store previous values
    this.x_prev = x_hat;
    this.dx_prev = dx_hat;
    this.t_prev = t;

    return x_hat;
  }
}

export class PoseFilterWrapper {
  private filters: OneEuroFilter[][] = [];

  constructor(numLandmarks = 33, freq = 30, minCutoff = 1.0, beta = 0.05, dCutoff = 1.0) {
    for (let i = 0; i < numLandmarks; i++) {
      // Create 3 filters per landmark (x, y, z)
      this.filters.push([
        new OneEuroFilter(freq, minCutoff, beta, dCutoff), // x
        new OneEuroFilter(freq, minCutoff, beta, dCutoff), // y
        new OneEuroFilter(freq, minCutoff, beta, dCutoff)  // z
      ]);
    }
  }

  filter(landmarks: any[], timestampMs: number) {
    if (!landmarks || landmarks.length === 0) return landmarks;
    
    const t = timestampMs / 1000; // Convert to seconds
    const smoothedLandmarks = [];

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (i < this.filters.length) {
        smoothedLandmarks.push({
          ...lm, // keep visibility and presence
          x: this.filters[i][0].filter(lm.x, t),
          y: this.filters[i][1].filter(lm.y, t),
          z: this.filters[i][2].filter(lm.z, t)
        });
      } else {
        // Fallback if there are more landmarks than expected
        smoothedLandmarks.push(lm);
      }
    }

    return smoothedLandmarks;
  }
}
