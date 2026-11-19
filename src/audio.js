// Procedural Web Audio API SFX & spatial ambient soundscape (zero external assets)
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.master = null;
    this.ambientReady = false;
    this.windGain = null;
    this.waterGain = null;
    this.trafficGain = null;
    this.noiseBuffer = null;

    this.lastCarWhoosh = 0;
    this.lastTrainBell = 0;
    this.lastTrainRumble = 0;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      this._ensureContext();
      this._startAmbient();
    } else if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    return this.enabled;
  }

  _ensureContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.85;
        this.master.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.master && this.ctx && this.enabled) {
      this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.05);
    }
  }

  _getNoiseBuffer() {
    if (this.noiseBuffer || !this.ctx) return this.noiseBuffer;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Soft pink/brownish noise for pleasant wind/water/traffic
      data[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = data[i];
      data[i] *= 2.4;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  _startAmbient() {
    if (this.ambientReady || !this.ctx || !this.master) return;
    this.ambientReady = true;

    const noiseBuf = this._getNoiseBuffer();

    // 1. Soft breeze / outdoor air
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = noiseBuf;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.035;
    windSrc.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    windSrc.start();

    // 2. River babble (higher filtered noise modulated by river proximity)
    const waterSrc = this.ctx.createBufferSource();
    waterSrc.buffer = noiseBuf;
    waterSrc.loop = true;
    const waterFilter = this.ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 1150;
    waterFilter.Q.value = 1.4;
    this.waterGain = this.ctx.createGain();
    this.waterGain.gain.value = 0.0;
    waterSrc.connect(waterFilter);
    waterFilter.connect(this.waterGain);
    this.waterGain.connect(this.master);
    waterSrc.start();

    // 3. Distant traffic rumble (lowpass noise modulated by road proximity)
    const trafficSrc = this.ctx.createBufferSource();
    trafficSrc.buffer = noiseBuf;
    trafficSrc.loop = true;
    const trafficFilter = this.ctx.createBiquadFilter();
    trafficFilter.type = 'lowpass';
    trafficFilter.frequency.value = 150;
    this.trafficGain = this.ctx.createGain();
    this.trafficGain.gain.value = 0.0;
    trafficSrc.connect(trafficFilter);
    trafficFilter.connect(this.trafficGain);
    this.trafficGain.connect(this.master);
    trafficSrc.start();
  }

  updateAmbient(riverProx, roadProx, isHidden = false) {
    if (!this.enabled || !this.ctx || !this.ambientReady) return;
    const now = this.ctx.currentTime;
    const muteMult = isHidden ? 0 : 1;
    this.windGain.gain.setTargetAtTime(0.032 * muteMult, now, 0.2);
    this.waterGain.gain.setTargetAtTime(Math.min(0.06, riverProx * 0.055) * muteMult, now, 0.15);
    this.trafficGain.gain.setTargetAtTime(Math.min(0.055, roadProx * 0.05) * muteMult, now, 0.15);
  }

  playHop() {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.065);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  playSplash(light = true) {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(light ? 440 : 320, now);
    osc.frequency.exponentialRampToValueAtTime(light ? 190 : 95, now + 0.11);

    gain.gain.setValueAtTime(light ? 0.055 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playCarPass(speedRatio = 1) {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this.lastCarWhoosh < 0.34) return;
    this.lastCarWhoosh = now;

    const src = this.ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    const topFreq = Math.min(1200, 420 * speedRatio);
    filter.frequency.setValueAtTime(topFreq, now);
    filter.frequency.exponentialRampToValueAtTime(160, now + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.25);
  }

  playTrainBell() {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this.lastTrainBell < 0.65) return;
    this.lastTrainBell = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1180, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  playTrainRumble() {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    if (now - this.lastTrainRumble < 0.22) return;
    this.lastTrainRumble = now;

    const src = this.ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 190;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.21);
  }

  playCoin() {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.055);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  playMilestone() {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.065, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  playCrash(isWater = false) {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isWater ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(isWater ? 340 : 160, now);
    osc.frequency.exponentialRampToValueAtTime(isWater ? 90 : 48, now + 0.22);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}

export const sound = new SoundEngine();
