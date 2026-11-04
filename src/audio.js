// Every sound is synthesised, so there are no audio assets to load or license.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.sea = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this.startSea();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  startSea() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(4);
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.045;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(lp).connect(gain).connect(this.master);
    src.start();
    lfo.start();
    this.sea = { gain, lp };
  }

  setStorm(storm) {
    if (!this.sea) return;
    const now = this.ctx.currentTime;
    this.sea.gain.gain.setTargetAtTime(0.045 + storm * 0.17, now, 1);
    this.sea.lp.frequency.setTargetAtTime(420 + storm * 900, now, 1);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  splash() {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.6);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1500, this.ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(260, this.ctx.currentTime + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.55);
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  bell() {
    for (const [i, when] of [[0, 0], [1, 0.7]]) {
      void i;
      this.tone(880, 1.5, 'sine', 0.13, when);
      this.tone(2210, 0.9, 'sine', 0.05, when);
      this.tone(3350, 0.4, 'sine', 0.025, when);
    }
  }

  horn() {
    for (const when of [0, 1.9]) {
      this.tone(98, 1.5, 'sawtooth', 0.09, when);
      this.tone(147, 1.5, 'sawtooth', 0.07, when);
    }
  }

  ping() {
    this.tone(1200, 0.28, 'sine', 0.09);
    this.tone(1800, 0.3, 'sine', 0.06, 0.1);
  }
  coin() {
    this.tone(1320, 0.1, 'triangle', 0.1);
    this.tone(1760, 0.2, 'triangle', 0.09, 0.08);
  }
  hit(perfect) {
    this.tone(perfect ? 990 : 660, 0.16, 'triangle', 0.16);
    if (perfect) this.tone(1480, 0.2, 'triangle', 0.1, 0.05);
  }
  miss() {
    this.tone(150, 0.25, 'square', 0.07, 0, 90);
  }
  click() {
    this.tone(520, 0.05, 'triangle', 0.05);
  }

  handleEvent(e) {
    switch (e.type) {
      case 'bell':
      case 'docked':
        this.bell();
        break;
      case 'horn':
      case 'stranded':
        this.horn();
        break;
      case 'cageDropped':
      case 'cageCollected':
        this.splash();
        break;
      case 'cageReady':
        this.ping();
        break;
      case 'sold':
      case 'upgraded':
      case 'hired':
        this.coin();
        break;
      default:
    }
  }
}
