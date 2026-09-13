export class SuspicionSystem {
  constructor() {
    this.value = 0;
    this.decayPerSecond = 8;
  }
  add(amount) {
    this.value = Math.min(100, this.value + amount);
  }
  update(dt) {
    if (this.value > 0) {
      this.value = Math.max(0, this.value - this.decayPerSecond * dt);
    }
  }
  static intensityToSuspicion(intensity, distanceFactor) {
    return intensity * distanceFactor * 70;
  }
  get level() {
    if (this.value < 15) return 'none';
    if (this.value < 40) return 'low';
    if (this.value < 70) return 'mid';
    return 'high';
  }
}
