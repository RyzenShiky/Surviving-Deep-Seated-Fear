export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
  }

  async init() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.master.gain.value = 0.8;
    this.sfx.gain.value = 1;
  }

  resume() {
    return this.ctx?.resume();
  }

  setMasterVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  setSfxVolume(v) {
    if (this.sfx) this.sfx.gain.value = v;
  }

  setListenerPosition(x, y, z, fx = 0, fz = -1) {
    if (!this.ctx?.listener?.positionX) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    l.positionX.setValueAtTime(x, t);
    l.positionY.setValueAtTime(y, t);
    l.positionZ.setValueAtTime(z, t);
    l.forwardX.setValueAtTime(fx, t);
    l.forwardY.setValueAtTime(0, t);
    l.forwardZ.setValueAtTime(fz, t);
    l.upY.setValueAtTime(1, t);
  }

  playFootstep(x, y, z, intensity = 1) {
    if (!this.ctx || !this.sfx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 50;
    panner.rolloffFactor = 1.2;
    osc.type = 'triangle';
    osc.frequency.value = 80 + Math.random() * 40;
    gain.gain.setValueAtTime(0.12 * intensity, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.sfx);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.13);
  }

  /** Soft heartbeat thud — rate/volume controlled by caller */
  setRain(on) {
    if (!this.ctx || !this.sfx) return;
    if (on && !this._rainNodes) {
      const bufSize = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(bp);
      bp.connect(g);
      g.connect(this.sfx);
      src.start();
      this._rainNodes = { src, g };
      g.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 1);
    } else if (!on && this._rainNodes) {
      const g = this._rainNodes.g;
      g.gain.cancelScheduledValues(this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 1);
      const nodes = this._rainNodes;
      this._rainNodes = null;
      setTimeout(() => {
        try { nodes.src.stop(); } catch {}
      }, 1200);
    }
    // already on/off: no-op (avoid gain spam every frame)
  }

  playHeartbeat(volume = 0.2) {
    if (!this.ctx || !this.sfx || volume <= 0.01) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, t0);
    osc.frequency.exponentialRampToValueAtTime(28, t0 + 0.12);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.45, volume), t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(gain);
    gain.connect(this.sfx);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }
}
