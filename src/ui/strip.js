// Taskbar mode: a thin 2D strip, a ship crossing left to right over a scrolling
// sea, with small symbols marking what just happened. It never touches WebGL, so
// it costs next to nothing while the player works.
import { CFG } from '../config.js';

const SYMBOLS = {
  cageDropped: { glyph: 'drop', color: '#e8602e' },
  cageReady: { glyph: 'ready', color: '#3f8f63' },
  cageCollected: { glyph: 'crab', color: '#b5473f' },
  docked: { glyph: 'port', color: '#3b3a40' },
  low: { glyph: 'warn', color: '#c7692a' },
  stranded: { glyph: 'warn', color: '#b5473f' },
  horn: { glyph: 'warn', color: '#b5473f' },
  bell: { glyph: 'port', color: '#c7692a' },
};

export class Strip {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.ctx = canvas.getContext('2d');
    this.scroll = 0;
    this.lap = 0;
    this.marks = [];
    this.w = 1;
    this.h = 1;
    this.heads = Array.from({ length: 22 }, (_, i) => ({
      x: (i * 137) % 900,
      s: 0.3 + ((i * 53) % 100) / 100,
      far: i % 3 !== 0,
    }));
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr;
  }

  handleEvent(e) {
    if (SYMBOLS[e.type]) this.marks.push({ type: e.type, x: this.shipX, born: performance.now() });
    if (this.marks.length > 24) this.marks.shift();
  }

  frame(dt) {
    const { game } = this;
    const s = game.s;
    const g = this.ctx;
    const W = this.w;
    const H = this.h;
    const right = Math.min(250, W * 0.42); // readout and the buttons live here
    const trackW = Math.max(60, W - right - 40);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const storm = s.weather.storm;
    const grey = s.weather.overcast;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, storm > 0.3 ? '#a2adb0' : grey > 0.4 ? '#cfd3d0' : '#e6e6de');
    sky.addColorStop(1, storm > 0.3 ? '#7f8d92' : '#c9d6d3');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const speed = Math.abs(s.ship.speed);
    this.scroll += speed * dt * 5;
    const seaY = H * 0.68;

    // Parallax islands in the mist.
    for (const h of this.heads) {
      const rate = h.far ? 0.3 : 0.6;
      const x = ((h.x - this.scroll * rate) % (W + 200) + W + 200) % (W + 200) - 100;
      const size = (h.far ? 9 : 14) * h.s + 3;
      g.fillStyle = h.far ? 'rgba(150,165,168,0.55)' : 'rgba(236,233,221,0.95)';
      g.beginPath();
      g.moveTo(x - size * 2, seaY);
      g.quadraticCurveTo(x - size * 1.6, seaY - size, x - size * 0.5, seaY - size);
      g.lineTo(x + size * 0.8, seaY - size);
      g.quadraticCurveTo(x + size * 1.7, seaY - size, x + size * 2, seaY);
      g.fill();
    }

    g.fillStyle = storm > 0.3 ? '#4e6670' : '#6f9ba5';
    g.fillRect(0, seaY, W, H - seaY);

    // Moving wave ticks.
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 26; i++) {
      const x = (((i * 71 - this.scroll) % W) + W) % W;
      const y = seaY + 3 + ((i * 13) % Math.max(1, H - seaY - 4));
      g.fillRect(x, y, 5 + (i % 4) * 2, 1);
    }

    // Progress: through the current leg if the captain has one, otherwise a lap.
    let progress;
    if (s.ship.docked) progress = 0.02;
    else {
      this.lap = (this.lap + (speed * dt) / 60) % 1;
      progress = this.lap;
    }
    const sx = 14 + progress * trackW;
    this.shipX = sx;

    // Track.
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(14, H - 5, trackW, 2);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(14, H - 5, sx - 14, 2);

    // Ship silhouette.
    const bob = Math.sin(performance.now() / 500) * (1 + storm * 2.5);
    const y0 = seaY + 1 + bob;
    g.fillStyle = '#6c2a37';
    g.beginPath();
    g.moveTo(sx - 13, y0 - 7);
    g.lineTo(sx + 15, y0 - 9);
    g.lineTo(sx + 9, y0 + 2);
    g.lineTo(sx - 11, y0 + 2);
    g.fill();
    g.fillStyle = '#f3eee3';
    g.fillRect(sx - 9, y0 - 15, 8, 8);
    g.fillStyle = '#a84c3e';
    g.fillRect(sx - 10, y0 - 16, 10, 2);
    g.fillStyle = '#e0363f';
    g.fillRect(sx - 6, y0 - 24, 1, 9);
    g.fillRect(sx - 12, y0 - 24, 6, 3);
    if (speed > 0.5) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 1; i < 6; i++) g.fillRect(sx - 12 - i * 8, y0 + 1, 5, 1);
    }

    // Event symbols sit where the ship was when they happened.
    const now = performance.now();
    this.marks = this.marks.filter((m) => now - m.born < 20000);
    for (const m of this.marks) {
      const sym = SYMBOLS[m.type];
      const alpha = Math.min(1, (20000 - (now - m.born)) / 3000);
      g.globalAlpha = alpha;
      this.drawSymbol(g, sym, m.x, 12);
      g.globalAlpha = 1;
    }

    // Readout.
    const ready = s.cages.filter((c) => s.t - c.t0 >= CFG.soakPeak).length;
    const fuel = s.fuel / game.maxFuel;
    const prov = s.provisions / game.maxProvisions;
    const rx = W - right + 6;
    g.font = '13px Alegreya, Georgia, serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = '#26282c';
    g.fillText(`$${Math.round(s.money)}`, rx, H * 0.3);
    g.fillText(`${Math.round(s.crabs)}/${game.maxTank}`, rx + 48, H * 0.3);
    if (ready) {
      g.fillStyle = '#2f7f55';
      g.fillText(`${ready} ready`, rx, H * 0.72);
    } else {
      g.fillStyle = '#44484d';
      g.fillText(`${s.cages.length} set`, rx, H * 0.72);
    }
    g.fillStyle = fuel < CFG.lowResource ? '#b5473f' : '#44484d';
    g.fillRect(rx + 48, H * 0.67, 36 * fuel, 3);
    g.fillStyle = prov < CFG.lowResource ? '#b5473f' : '#44484d';
    g.fillRect(rx + 48, H * 0.67 + 5, 36 * prov, 3);
  }

  drawSymbol(g, sym, x, y) {
    g.fillStyle = sym.color;
    g.strokeStyle = sym.color;
    g.lineWidth = 1.5;
    switch (sym.glyph) {
      case 'drop':
        g.beginPath();
        g.moveTo(x, y - 6);
        g.lineTo(x, y + 2);
        g.stroke();
        g.fillRect(x - 3, y + 2, 6, 4);
        break;
      case 'ready':
        g.beginPath();
        g.moveTo(x - 5, y);
        g.lineTo(x - 1, y + 4);
        g.lineTo(x + 5, y - 5);
        g.stroke();
        break;
      case 'crab':
        g.beginPath();
        g.arc(x, y, 4, 0, 6.3);
        g.fill();
        g.fillRect(x - 7, y - 3, 3, 2);
        g.fillRect(x + 4, y - 3, 3, 2);
        break;
      case 'port':
        g.beginPath();
        g.arc(x, y - 1, 4, Math.PI, 0);
        g.lineTo(x + 5, y + 4);
        g.lineTo(x - 5, y + 4);
        g.closePath();
        g.fill();
        break;
      default:
        g.beginPath();
        g.moveTo(x, y - 6);
        g.lineTo(x + 6, y + 5);
        g.lineTo(x - 6, y + 5);
        g.closePath();
        g.fill();
    }
  }
}
