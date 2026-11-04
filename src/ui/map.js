// The chart: a nautical map of the coast where you manage every cage in the water,
// plot a waypoint for yourself, and chain orders for a hired captain.
import { CFG } from '../config.js';
import { ICON } from './dash.js';

const LABEL = { go: 'Sail to', drop: 'Drop cage', collect: 'Collect cage', port: 'Return to port' };
const S = 720;
const BASE = { px: 2, x0: -340, x1: 340, z0: -670, z1: 340 };

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class MapPanel {
  constructor({ game, world, audio, view }) {
    this.view = view;
    this.game = game;
    this.world = world;
    this.audio = audio;
    this.tool = 'select';
    this.base = null;
    this.el = null;
    this.selected = null;
    this.zoom = 1;
    this.cx = 0;
    this.cz = 0;
    this.hover = null;
  }

  // Painted once at 2 px per unit, so it stays crisp at the chart's working scale:
  // a smooth depth wash, fine depth lines, an inked coast, and calm pale land.
  buildBase() {
    const { world } = this;
    const { px, x0, z0 } = BASE;
    const w = Math.ceil((BASE.x1 - x0) * px);
    const h = Math.ceil((BASE.z1 - z0) * px);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const ice = world.features.filter((f) => f.kind === 'ice');
    const rock = world.features.filter((f) => f.kind === 'skerry');
    const step = 1 / px;
    for (let y = 0; y < h; y++) {
      const wz = z0 + y * step;
      for (let x = 0; x < w; x++) {
        const wx = x0 + x * step;
        const d = world.shoreDistance(wx, wz);
        let r;
        let gg;
        let bb;
        if (d <= 0.01) {
          const e = 1.5;
          const shade = Math.max(-0.1, Math.min(0.1, (world.heightAt(wx + e, wz) - world.heightAt(wx - e, wz) + world.heightAt(wx, wz + e) - world.heightAt(wx, wz - e)) * 0.018));
          const h0 = world.heightAt(wx, wz);
          const v = 0.97 - shade;
          r = 244 * v;
          gg = 245 * v;
          bb = 243 * v;
          if (h0 < 1 && ice.some((f) => Math.hypot(wx - f.x, wz - f.z) < f.r * 1.6)) {
            r = 226;
            gg = 241;
            bb = 246;
          } else if (rock.some((f) => Math.hypot(wx - f.x, wz - f.z) < f.r * 1.6)) {
            r = 146 * v;
            gg = 156 * v;
            bb = 168 * v;
          }
        } else {
          const t = Math.min(1, d / 24);
          const k = t * t * (3 - 2 * t);
          r = 178 + (122 - 178) * k;
          gg = 218 + (177 - 218) * k;
          bb = 218 + (185 - 218) * k;
          // Depth lines, thin enough to read as ink.
          if (Math.abs(d - 4) < 0.28 || Math.abs(d - 11) < 0.24) {
            r *= 0.9;
            gg *= 0.94;
            bb *= 0.95;
          }
          if (d < 0.55) {
            r = 74;
            gg = 96;
            bb = 108;
          }
        }
        const i = (y * w + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = bb;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(38, 52, 60, 0.08)';
    g.lineWidth = 1;
    for (let v = -640; v <= 640; v += 80) {
      g.beginPath();
      g.moveTo((v - x0) * px, 0);
      g.lineTo((v - x0) * px, h);
      g.moveTo(0, (v - z0) * px);
      g.lineTo(w, (v - z0) * px);
      g.stroke();
    }
    this.base = c;
  }

  mount(wrap) {
    if (!this.base) this.buildBase();
    wrap.innerHTML = `
      <div class="dialog-wrap">
        <div class="paper panel map-panel">
          <button class="close" data-ui="closeMap" aria-label="Close">×</button>
          <h2>Chart of the Grounds</h2>
          <div class="map-layout">
            <div class="chart-wrap">
              <canvas width="${S}" height="${S}"></canvas>
              <div class="tools chart-tools" data-tools></div>
              <div class="chart-hint" data-hint></div>
            </div>
            <div class="map-side">
              <div class="side-head"><h3>Cages</h3><span class="sub" data-summary></span></div>
              <ul class="cagelist" data-cages></ul>
              <div class="tools" data-roundup></div>
              <div class="side-head"><h3>Captain's orders</h3></div>
              <div data-orders-note></div>
              <ul class="chain" data-chain></ul>
              <div class="tools" data-chain-tools></div>
            </div>
          </div>
        </div>
      </div>`;
    this.el = wrap;
    this.canvas = wrap.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.keys = {};
    this.canvas.addEventListener('click', (e) => this.onChartClick(e));
    this.canvas.addEventListener('mousemove', (e) => {
      this.hover = this.toWorld(e);
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
    });
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    wrap.addEventListener('click', (e) => this.onPanelClick(e));
    this.zoom = this.seaFrame.zoom;
    this.cx = this.seaFrame.x;
    this.cz = this.seaFrame.z;
  }

  unmount() {
    if (this.el) this.el.innerHTML = '';
    this.el = null;
  }

  // ---- coordinates ----------------------------------------------------------
  // The chart turns with the camera, so land, sea and north sit where they do on screen.
  // At zoom 1 the whole world fits as a tilted square inside the frame.
  get pxPerUnit() {
    return (S * this.zoom) / (this.world.size * Math.SQRT2);
  }
  // The game happens at sea, so the chart frames the water: where it lies comes from
  // the map itself, ignoring the odd far-off bay. Land is only a corner of the frame.
  get seaFrame() {
    if (this.frame) return this.frame;
    const { world } = this;
    const xs = [];
    const zs = [];
    for (let gz = 0; gz < world.n; gz += 8) {
      for (let gx = 0; gx < world.n; gx += 8) {
        if (world.mask[gz * world.n + gx]) continue;
        xs.push(gx * world.cell - world.half);
        zs.push(gz * world.cell - world.half);
      }
    }
    xs.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);
    const pick = (arr, q) => arr[Math.floor((arr.length - 1) * q)];
    const x0 = pick(xs, 0.02);
    const x1 = pick(xs, 0.98);
    const z0 = pick(zs, 0.02);
    const z1 = pick(zs, 0.98);
    // At the chart's tilt, a W by D block of sea spans (W + D) / sqrt(2) across.
    const across = (x1 - x0 + (z1 - z0)) * Math.SQRT1_2;
    this.frame = {
      x: (x0 + x1) / 2,
      // Nudged north, which slides the land further into the lower-left corner.
      z: (z0 + z1) / 2 - 42,
      zoom: Math.max(1, (world.size * Math.SQRT2) / across),
    };
    return this.frame;
  }
  clampView() {
    const f = this.seaFrame;
    this.zoom = Math.max(f.zoom, Math.min(f.zoom * 4, this.zoom));
    const lim = this.world.half * 1.2 * (1 - f.zoom / this.zoom);
    this.cx = Math.max(f.x - lim, Math.min(f.x + lim, this.cx));
    this.cz = Math.max(f.z - lim, Math.min(f.z + lim, this.cz));
  }
  toPx(x, z) {
    const k = this.pxPerUnit;
    const c = Math.cos(this.view.yaw);
    const s = Math.sin(this.view.yaw);
    const dx = x - this.cx;
    const dz = z - this.cz;
    return [(dx * c - dz * s) * k + S / 2, (dx * s + dz * c) * k + S / 2];
  }
  toWorld(e) {
    const r = this.canvas.getBoundingClientRect();
    const k = this.pxPerUnit;
    const c = Math.cos(this.view.yaw);
    const s = Math.sin(this.view.yaw);
    const px = (((e.clientX - r.left) / r.width) * S - S / 2) / k;
    const py = (((e.clientY - r.top) / r.height) * S - S / 2) / k;
    return { x: px * c + py * s + this.cx, z: -px * s + py * c + this.cz };
  }
  onWheel(e) {
    e.preventDefault();
    const before = this.toWorld(e);
    this.zoom *= Math.exp(-e.deltaY * 0.0014);
    this.clampView();
    const after = this.toWorld(e);
    this.cx += before.x - after.x;
    this.cz += before.z - after.z;
    this.clampView();
  }

  // ---- input ----------------------------------------------------------------
  cageNear(x, z, reach = 22 / this.zoom) {
    let best = null;
    let bd = reach;
    for (const c of this.game.s.cages) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  onChartClick(e) {
    const { game, world } = this;
    const { x, z } = this.toWorld(e);
    this.audio.click();
    if (this.tool === 'select') {
      const c = this.cageNear(x, z);
      this.selected = c ? c.id : null;
      return;
    }
    const b = world.bounds;
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) {
      game.toast('That is beyond the charted waters.', 'warn');
      return;
    }
    if (world.shoreDistance(x, z) < CFG.minDropShoreDistance + 1) {
      game.toast('Pick a spot further from the shore.', 'warn');
      return;
    }
    if (this.tool === 'way') {
      game.setWaypoint(x, z);
      this.tool = 'select';
      return;
    }
    if (this.tool === 'collect') {
      let best = this.cageNear(x, z);
      let bd = best ? Math.hypot(best.x - x, best.z - z) : 22 / this.zoom;
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
    game.addOrder({ type: this.tool, x, z });
  }

  onPanelClick(e) {
    const t = e.target.closest('[data-cage],[data-cage-act],[data-tool]');
    if (!t) return;
    const { game } = this;
    this.audio.click();
    if (t.dataset.tool) {
      this.tool = t.dataset.tool;
      return;
    }
    if (t.dataset.cageAct) {
      const [act, idStr] = t.dataset.cageAct.split(':');
      const id = Number(idStr);
      const c = game.s.cages.find((k) => k.id === id);
      e.stopPropagation();
      if (act === 'way' && c) game.setWaypoint(c.x, c.z);
      if (act === 'collect') game.orderCollect(id);
      if (act === 'drop') {
        game.abandonCage(id);
        this.selected = null;
      }
      if (act === 'roundup') game.orderCollectReady();
      if (act === 'clearway') game.clearWaypoint();
      return;
    }
    const id = Number(t.dataset.cage);
    this.selected = this.selected === id ? null : id;
    const c = game.s.cages.find((k) => k.id === id);
    if (c && this.selected && this.zoom > this.seaFrame.zoom) {
      this.cx = c.x;
      this.cz = c.z;
      this.clampView();
    }
  }

  setHtml(key, sel, html) {
    if (this.keys[key] === html) return;
    this.keys[key] = html;
    const el = this.el.querySelector(sel);
    if (el) el.innerHTML = html;
  }

  // ---- frame ----------------------------------------------------------------
  update() {
    if (!this.el || !this.canvas) return;
    const { game, world } = this;
    const s = game.s;
    const g = this.ctx;
    const k = this.pxPerUnit;
    const yaw = this.view.yaw;
    g.imageSmoothingEnabled = true;
    g.fillStyle = '#7ab1b9';
    g.fillRect(0, 0, S, S);
    g.imageSmoothingQuality = 'high';
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(yaw);
    g.scale(k / BASE.px, k / BASE.px);
    g.drawImage(this.base, (BASE.x0 - this.cx) * BASE.px, (BASE.z0 - this.cz) * BASE.px);
    g.restore();
    g.strokeStyle = 'rgba(38, 52, 60, 0.4)';
    g.lineWidth = 1;
    g.setLineDash([6, 5]);
    g.beginPath();
    const lim = world.bounds;
    g.moveTo(...this.toPx(lim.x0, lim.z0));
    g.lineTo(...this.toPx(lim.x1, lim.z0));
    g.lineTo(...this.toPx(lim.x1, lim.z1));
    g.lineTo(...this.toPx(lim.x0, lim.z1));
    g.closePath();
    g.stroke();
    g.setLineDash([]);

    // Loose ice big enough to matter. It drifts and breaks, so it is drawn live.
    g.fillStyle = '#f7fbfc';
    g.strokeStyle = 'rgba(70, 110, 125, 0.7)';
    for (const f of this.view.floes.items) {
      if (!f.alive || f.r < 1.5) continue;
      const [fx, fy] = this.toPx(f.x, f.z);
      if (fx < -8 || fy < -8 || fx > S + 8 || fy > S + 8) continue;
      g.beginPath();
      g.arc(fx, fy, Math.max(1.6, f.r * k), 0, 6.3);
      g.fill();
      g.stroke();
    }

    // Town and pier.
    const [tx, tz] = this.toPx(0, 14);
    const [px0, pz0] = this.toPx(0, 0);
    const [px1, pz1] = this.toPx(0, world.port.pier.z0);
    g.strokeStyle = '#6a5a4c';
    g.lineWidth = Math.max(2, 3 * k);
    g.beginPath();
    g.moveTo(px0, pz0);
    g.lineTo(px1, pz1);
    g.stroke();
    g.fillStyle = '#b5362e';
    g.fillRect(tx - 5, tz - 5, 10, 10);
    g.fillStyle = '#26343c';
    g.font = "500 14px 'Alegreya SC', Georgia, serif";
    g.textAlign = 'left';
    g.fillText('Vardhamn', tx + 9, tz + 5);

    // Order route.
    const a = s.auto;
    if (a.orders.length) {
      g.strokeStyle = 'rgba(38, 52, 60, 0.75)';
      g.setLineDash([5, 5]);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(...this.toPx(s.ship.x, s.ship.z));
      const orders = [...a.orders.slice(a.idx), ...a.orders.slice(0, a.idx)];
      for (const o of orders) {
        g.lineTo(...this.toPx(o.type === 'port' ? world.port.x : o.x, o.type === 'port' ? world.port.z : o.z));
      }
      g.stroke();
      g.setLineDash([]);
      g.textAlign = 'center';
      g.font = "700 12px Alegreya, Georgia, serif";
      a.orders.forEach((o, i) => {
        if (o.type === 'port') return;
        const [x, y] = this.toPx(o.x, o.z);
        g.fillStyle = o.type === 'drop' ? '#e3662e' : o.type === 'collect' ? '#2f7f55' : '#26343c';
        g.beginPath();
        g.arc(x, y, 9, 0, 6.3);
        g.fill();
        g.fillStyle = '#fff';
        g.fillText(String(i + 1), x, y + 4);
      });
    }

    // Waypoint.
    if (s.waypoint) {
      const [wx, wy] = this.toPx(s.waypoint.x, s.waypoint.z);
      const [sx, sy] = this.toPx(s.ship.x, s.ship.z);
      g.strokeStyle = '#b5362e';
      g.lineWidth = 1.5;
      g.setLineDash([2, 4]);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(wx, wy);
      g.stroke();
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(wx, wy - 9);
      g.lineTo(wx + 7, wy);
      g.lineTo(wx, wy + 9);
      g.lineTo(wx - 7, wy);
      g.closePath();
      g.fillStyle = '#b5362e';
      g.fill();
    }

    // Cages with a soak ring and their time since drop.
    g.textAlign = 'center';
    for (const c of s.cages) {
      const [x, y] = this.toPx(c.x, c.z);
      const info = game.cageInfo(c);
      const on = this.selected === c.id;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(38, 52, 60, 0.25)';
      g.beginPath();
      g.arc(x, y, on ? 11 : 8.5, 0, 6.3);
      g.stroke();
      g.strokeStyle = info.late ? '#b5362e' : info.ready ? '#2f7f55' : '#c98a22';
      g.beginPath();
      g.arc(x, y, on ? 11 : 8.5, -1.57, -1.57 + info.soak * 6.283);
      g.stroke();
      g.fillStyle = '#e3662e';
      g.beginPath();
      g.arc(x, y, 3.4, 0, 6.3);
      g.fill();
      g.fillStyle = '#26343c';
      g.font = `${on ? 700 : 400} 12.5px Alegreya, Georgia, serif`;
      g.fillText(`#${c.id}  ${fmtTime(info.age)}`, x, y - (on ? 15 : 13));
    }

    // Radar reach and ship.
    const [sx, sy] = this.toPx(s.ship.x, s.ship.z);
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(sx, sy, game.radarRange * k, 0, 6.3);
    g.stroke();
    const hx = Math.sin(s.ship.heading - yaw);
    const hz = Math.cos(s.ship.heading - yaw);
    g.fillStyle = '#26343c';
    g.beginPath();
    g.moveTo(sx + hx * 12, sy + hz * 12);
    g.lineTo(sx - hx * 7 + hz * 6.5, sy - hz * 7 - hx * 6.5);
    g.lineTo(sx - hx * 7 - hz * 6.5, sy - hz * 7 + hx * 6.5);
    g.closePath();
    g.fill();

    // Compass rose: its N is the same direction as N on the bridge compass.
    const rx = S - 58;
    const ry = 58;
    g.save();
    g.translate(rx, ry);
    g.fillStyle = 'rgba(251, 252, 252, 0.9)';
    g.beginPath();
    g.arc(0, 0, 38, 0, 6.3);
    g.fill();
    g.strokeStyle = '#26343c';
    g.lineWidth = 1;
    g.stroke();
    g.rotate(yaw);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = '#26343c';
      g.beginPath();
      g.moveTo(0, -26);
      g.lineTo(4.5, -4);
      g.lineTo(-4.5, -4);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#b5362e';
    g.beginPath();
    g.moveTo(0, -30);
    g.lineTo(5, -4);
    g.lineTo(-5, -4);
    g.closePath();
    g.fill();
    g.restore();
    const nx = rx + Math.sin(yaw) * 46;
    const ny = ry - Math.cos(yaw) * 46;
    g.fillStyle = '#b5362e';
    g.font = "500 15px 'Alegreya SC', Georgia, serif";
    g.textAlign = 'center';
    g.fillText('N', Math.min(S - 8, nx), Math.max(14, ny + 5));

    // Scale bar.
    const bar = 100 * k;
    g.fillStyle = 'rgba(38, 52, 60, 0.8)';
    g.fillRect(S - bar - 16, S - 18, bar, 2);
    g.font = "12px Alegreya, Georgia, serif";
    g.textAlign = 'right';
    g.fillText('100 m', S - 16, S - 23);

    this.renderSide();
  }

  renderSide() {
    const { game } = this;
    const s = game.s;
    const cap = s.crew.captain;

    // Tool strip under the chart.
    const tools = [['select', 'Inspect'], ['way', 'Waypoint']];
    if (cap) tools.push(['go', 'Sail'], ['drop', 'Drop'], ['collect', 'Collect']);
    let toolHtml = tools.map(([t, l]) => `<button class="btn ${this.tool === t ? 'on' : ''}" data-tool="${t}">${l}</button>`).join('');
    if (cap) toolHtml += '<button class="btn" data-ui="orderPort">Port</button>';
    if (s.waypoint) toolHtml += '<button class="btn" data-cage-act="clearway:0">Clear waypoint</button>';
    this.setHtml('tools', '[data-tools]', toolHtml);
    const hints = {
      select: 'Click a cage to inspect it. Scroll to zoom.',
      way: 'Click the sea to mark a waypoint. Your compass will point to it.',
      go: 'Click the sea: the captain sails there.',
      drop: 'Click the sea: the crew drops a cage there.',
      collect: 'Click a cage or a planned drop to collect it.',
    };
    this.setHtml('hint', '[data-hint]', hints[this.tool]);

    // Cage list.
    const rows = s.cages
      .slice()
      .sort((a, b) => a.t0 - b.t0)
      .map((c) => {
        const info = game.cageInfo(c);
        const cls = info.late ? 'late' : info.ready ? 'ready' : '';
        const on = this.selected === c.id;
        const time = info.ready ? (info.late ? `${info.lost} crabs lost` : 'at its peak') : `ready in ${fmtTime(info.untilReady)}`;
        const quality = c.density > 0.66 ? 'rich ground' : c.density > 0.33 ? 'fair ground' : 'thin ground';
        return `<li class="cagerow-li ${on ? 'on' : ''}" data-cage="${c.id}">
          <div class="cg-top"><strong>Cage ${c.id}</strong><span class="pill ${cls}">${info.status}</span><span class="cg-num">~${info.crabs} ${ICON.crab}</span></div>
          <div class="soak"><i class="${cls}" style="width:${(info.soak * 100).toFixed(0)}%"></i></div>
          <div class="cg-sub">${time} · ${Math.round(info.distance)} m away</div>
          ${
            on
              ? `<div class="cg-extra">
                   <div class="cg-sub">Soaked ${fmtTime(info.age)} on ${quality}.</div>
                   <div class="tools">
                     <button class="btn" data-cage-act="way:${c.id}">Set course</button>
                     ${cap ? `<button class="btn" data-cage-act="collect:${c.id}">Order collect</button>` : ''}
                     <button class="btn" data-cage-act="drop:${c.id}">Write off $${CFG.cageWriteOff}</button>
                   </div>
                 </div>`
              : ''
          }
        </li>`;
      })
      .join('');
    this.setHtml('cages', '[data-cages]', rows || '<li class="chain-empty">No cages in the water. Slow to gear 1 at sea and press E.</li>');
    const ready = s.cages.filter((c) => game.cageInfo(c).ready).length;
    this.setHtml('summary', '[data-summary]', `${s.cages.length} of ${game.maxCages} out · ${ready} ready`);
    this.setHtml(
      'roundup',
      '[data-roundup]',
      cap && s.crew.deckhand && ready ? `<button class="btn primary" data-cage-act="roundup:0">Round up ${ready} ready, then port</button>` : '',
    );

    // Orders.
    const a = s.auto;
    this.setHtml(
      'ordersNote',
      '[data-orders-note]',
      cap ? (a.orders.length ? '' : '<p class="chain-empty">Pick a tool, then click the chart.</p>') : '<p class="chain-empty">Hire a captain at the crew board to chain orders here.</p>',
    );
    const chain = a.orders
      .map((o, i) => `<li class="${a.active && i === a.idx ? 'cur' : ''}"><span>${i + 1}. ${LABEL[o.type]}</span><button data-remove="${i}" aria-label="Remove">×</button></li>`)
      .join('');
    this.setHtml('chain', '[data-chain]', chain);
    this.setHtml(
      'chainTools',
      '[data-chain-tools]',
      cap
        ? `<button class="btn primary" data-ui="chainStart" ${a.orders.length ? '' : 'disabled'}>${a.active ? 'Stop chain' : 'Start chain'}</button>
           <button class="btn ${a.loop ? 'on' : ''}" data-ui="chainLoop">Loop</button>
           <button class="btn" data-ui="chainClear">Clear</button>`
        : '',
    );
  }
}
