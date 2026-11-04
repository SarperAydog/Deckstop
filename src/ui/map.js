// Large-window chart: shows every cage's soak time and lets a hired captain chain
// orders by clicking the sea.
import { CFG } from '../config.js';
import { cageYield } from '../sim/game.js';

const LABEL = { go: 'Sail to', drop: 'Drop cage', collect: 'Collect cage', port: 'Return to port' };

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class MapPanel {
  constructor({ game, world, audio }) {
    this.game = game;
    this.world = world;
    this.audio = audio;
    this.tool = 'drop';
    this.base = null;
    this.el = null;
    this.lastChain = '';
  }

  buildBase() {
    const S = 640;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const { world } = this;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const wx = (x / S) * world.size - world.half;
        const wz = (y / S) * world.size - world.half;
        const d = world.shoreDistance(wx, wz);
        let r = 170;
        let gg = 198;
        let b = 201;
        if (d <= 0.01) {
          r = 236;
          gg = 232;
          b = 220;
        } else if (d < 1.4) {
          r = 246;
          gg = 248;
          b = 244;
        } else if (d < 5) {
          r = 190;
          gg = 214;
          b = 212;
        }
        const i = (y * S + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.base = c;
  }

  mount(wrap) {
    if (!this.base) this.buildBase();
    const hasCaptain = this.game.s.crew.captain;
    wrap.innerHTML = `
      <div class="dialog-wrap">
        <div class="paper panel map-panel">
          <button class="close" data-ui="closeMap" aria-label="Close">×</button>
          <h2>Chart</h2>
          <div class="map-layout">
            <canvas width="640" height="640"></canvas>
            <div>
              <h3 style="margin-top:0">Orders</h3>
              ${
                hasCaptain
                  ? `<div class="tools">
                      ${['go', 'drop', 'collect'].map((t) => `<button class="btn" data-tool="${t}">${{ go: 'Sail', drop: 'Drop', collect: 'Collect' }[t]}</button>`).join('')}
                      <button class="btn" data-ui="orderPort">Port</button>
                    </div>
                    <div class="chain-empty">Pick a tool, then click the chart.</div>`
                  : '<p class="chain-empty">The chart shows your cages. Hire a captain at the job board to give chained orders.</p>'
              }
              <ul class="chain"></ul>
              ${
                hasCaptain
                  ? `<div class="tools">
                      <button class="btn primary" data-ui="chainStart">Start chain</button>
                      <button class="btn" data-ui="chainLoop">Loop</button>
                      <button class="btn" data-ui="chainClear">Clear</button>
                    </div>`
                  : ''
              }
              <h3>Cages</h3>
              <ul class="chain" data-cages></ul>
            </div>
          </div>
        </div>
      </div>`;
    this.el = wrap;
    this.canvas = wrap.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.lastChain = '';
    this.lastCages = '';
    this.canvas.addEventListener('click', (e) => this.onClick(e));
    wrap.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tool = b.dataset.tool;
        this.audio.click();
      }),
    );
  }

  unmount() {
    if (this.el) this.el.innerHTML = '';
    this.el = null;
  }

  onClick(e) {
    const { game, world } = this;
    if (!game.s.crew.captain) return;
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * world.size - world.half;
    const z = ((e.clientY - r.top) / r.height) * world.size - world.half;
    this.audio.click();
    if (this.tool === 'collect') {
      let best = null;
      let bd = 22;
      for (const c of game.s.cages) {
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      for (const o of game.s.auto.orders) {
        if (o.type !== 'drop') continue;
        const d = Math.hypot(o.x - x, o.z - z);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (!best) {
        game.toast('Click near a cage or a planned drop.', 'warn');
        return;
      }
      game.addOrder({ type: 'collect', x: best.x, z: best.z });
      return;
    }
    if (world.shoreDistance(x, z) < CFG.minDropShoreDistance + 1) {
      game.toast('Pick a spot further from the shore.', 'warn');
      return;
    }
    game.addOrder({ type: this.tool, x, z });
  }

  update() {
    if (!this.el || !this.canvas) return;
    const { game, world } = this;
    const s = game.s;
    const g = this.ctx;
    const S = 640;
    const sc = S / world.size;
    const px = (v) => (v + world.half) * sc;
    g.drawImage(this.base, 0, 0);

    // Port.
    g.fillStyle = '#b5473f';
    g.fillRect(px(world.port.x) - 5, px(world.port.z) - 5, 10, 10);

    // Order route.
    const a = s.auto;
    g.strokeStyle = 'rgba(59,58,64,0.75)';
    g.setLineDash([5, 5]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px(s.ship.x), px(s.ship.z));
    const orders = [...a.orders.slice(a.idx), ...a.orders.slice(0, a.idx)];
    for (const o of orders) {
      const ox = o.type === 'port' ? world.port.x : o.x;
      const oz = o.type === 'port' ? world.port.z : o.z;
      g.lineTo(px(ox), px(oz));
    }
    g.stroke();
    g.setLineDash([]);
    g.font = '700 13px Alegreya, Georgia, serif';
    g.textAlign = 'center';
    a.orders.forEach((o, i) => {
      if (o.type === 'port') return;
      const x = px(o.x);
      const y = px(o.z);
      g.fillStyle = o.type === 'drop' ? '#e8602e' : o.type === 'collect' ? '#3f8f63' : '#3b3a40';
      g.beginPath();
      g.arc(x, y, 8, 0, 6.3);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(String(i + 1), x, y + 4);
    });

    // Cages with their time since drop.
    for (const c of s.cages) {
      const x = px(c.x);
      const y = px(c.z);
      const age = s.t - c.t0;
      const frac = Math.min(1, age / CFG.soakPeak);
      const ready = age >= CFG.soakPeak;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(59,58,64,0.25)';
      g.beginPath();
      g.arc(x, y, 8, 0, 6.3);
      g.stroke();
      g.strokeStyle = ready ? '#2f7f55' : '#d98a2a';
      g.beginPath();
      g.arc(x, y, 8, -1.57, -1.57 + frac * 6.283);
      g.stroke();
      g.fillStyle = '#e8602e';
      g.beginPath();
      g.arc(x, y, 3.2, 0, 6.3);
      g.fill();
      g.fillStyle = '#3b3a40';
      g.font = '12px Alegreya, Georgia, serif';
      g.fillText(fmtTime(age), x, y - 12);
    }

    // Ship.
    const hx = Math.sin(s.ship.heading);
    const hz = Math.cos(s.ship.heading);
    const sx = px(s.ship.x);
    const sy = px(s.ship.z);
    g.fillStyle = '#6c2a37';
    g.beginPath();
    g.moveTo(sx + hx * 11, sy + hz * 11);
    g.lineTo(sx - hx * 7 + hz * 6, sy - hz * 7 - hx * 6);
    g.lineTo(sx - hx * 7 - hz * 6, sy - hz * 7 + hx * 6);
    g.closePath();
    g.fill();

    // Radar reach.
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(sx, sy, game.radarRange * sc, 0, 6.3);
    g.stroke();

    const chainKey = JSON.stringify([a.orders.map((o) => o.type + (o.x ?? '')), a.idx, a.active, a.loop, this.tool]);
    if (chainKey !== this.lastChain) {
      this.lastChain = chainKey;
      const ul = this.el.querySelector('.chain');
      ul.innerHTML = a.orders
        .map(
          (o, i) => `<li class="${a.active && i === a.idx ? 'cur' : ''}"><span>${i + 1}. ${LABEL[o.type]}</span><button data-remove="${i}" aria-label="Remove">×</button></li>`,
        )
        .join('');
      const start = this.el.querySelector('[data-ui="chainStart"]');
      if (start) {
        start.textContent = a.active ? 'Stop chain' : 'Start chain';
        this.el.querySelector('[data-ui="chainLoop"]').classList.toggle('on', a.loop);
        this.el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.tool));
      }
    }

    const cageRows = s.cages
      .map((c) => {
        const age = s.t - c.t0;
        return `<li><span>${fmtTime(age)}</span><span>~${Math.round(cageYield(c, s.t))} crabs</span></li>`;
      })
      .join('');
    if (cageRows !== this.lastCages) {
      this.lastCages = cageRows;
      this.el.querySelector('[data-cages]').innerHTML = cageRows || '<li class="chain-empty">None in the water.</li>';
    }
  }
}
