// The bridge console along the bottom of the screen. It is built once as DOM and SVG,
// then only attributes change each frame, so it stays cheap and never flickers.
import { CFG } from '../config.js';

export const ICON = {
  fuel: '<svg viewBox="0 0 16 16"><path d="M4 2h6v12H3V3zm1 2v3h4V4zM11 5l2 2v5a1 1 0 0 1-2 0V9h-1" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  food: '<svg viewBox="0 0 16 16"><path d="M3 7h10a5 5 0 0 1-10 0zM5 14h6M6 5c0-1.5 1-1.5 1-3M9 5c0-1.5 1-1.5 1-3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  crab: '<svg viewBox="0 0 16 16"><ellipse cx="8" cy="9.5" rx="4" ry="2.8" fill="currentColor"/><path d="M4 9 1.5 7V4M12 9l2.5-2V4M4.5 11.5 2 13.5M11.5 11.5l2.5 2M1 3.5l1 1.2 1-1.2M13 3.5l1 1.2 1-1.2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  cage: '<svg viewBox="0 0 16 16"><path d="M2.5 4.5h11v8h-11zM6.2 4.5v8M9.8 4.5v8M2.5 8.5h11" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
};

const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
};

function speedDial() {
  let ticks = '';
  for (let i = 0; i <= 10; i++) {
    const deg = -110 + i * 22;
    const [x0, y0] = polar(50, 52, 39, deg);
    const [x1, y1] = polar(50, 52, i % 5 === 0 ? 31 : 35, deg);
    ticks += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${i % 5 === 0 ? 1.6 : 0.9}"/>`;
  }
  return `<svg class="dial" viewBox="0 0 100 74">
    <path d="M13.3 65.3 A39 39 0 1 1 86.7 65.3" fill="none" class="arc"/>
    <g class="ticks">${ticks}</g>
    <g data-needle><path d="M50 56 L48.6 52 L50 19 L51.4 52 Z" class="needle"/></g>
    <circle cx="50" cy="52" r="3.1" class="hub"/>
    <text x="50" y="69" class="reading" data-speed>0.0</text>
  </svg>`;
}

function helmWheel() {
  let spokes = '';
  for (let i = 0; i < 6; i++) spokes += `<rect x="48.9" y="16" width="2.2" height="34" transform="rotate(${i * 60} 50 50)" class="spoke"/>`;
  let pegs = '';
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = polar(50, 50, 34, i * 45);
    const [x1, y1] = polar(50, 50, 43, i * 45);
    pegs += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="peg"/>`;
  }
  let scale = '';
  for (let i = -3; i <= 3; i++) {
    const x = 50 + i * 14;
    scale += `<line x1="${x}" y1="3" x2="${x}" y2="${i === 0 ? 11 : i % 3 === 0 ? 9 : 7}" stroke-width="${i === 0 ? 1.6 : 1}"/>`;
  }
  return `<svg class="wheel" viewBox="0 0 100 100" data-ui="centerHelm">
    <title>Wheel. Click or press X to centre it.</title>
    <g data-wheel>
      ${pegs}
      <circle cx="50" cy="50" r="33" class="rim"/>
      <circle cx="50" cy="50" r="28.5" class="rim2"/>
      ${spokes}
      <circle cx="50" cy="50" r="7" class="boss"/>
      <rect x="47.8" y="16" width="4.4" height="6.5" class="king"/>
    </g>
  </svg>
  <svg class="rudder" viewBox="0 0 100 18">
    <g class="ticks">${scale}</g>
    <path d="M0 16 H100" class="base"/>
    <path d="M50 16 L46 8 H54 Z" class="mark" data-rudder/>
  </svg>`;
}

function compass() {
  let t = '';
  for (let i = 0; i < 16; i++) {
    const big = i % 4 === 0;
    const [x0, y0] = polar(50, 50, 44, i * 22.5);
    const [x1, y1] = polar(50, 50, big ? 36 : 40, i * 22.5);
    t += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${big ? 1.6 : 0.8}"/>`;
  }
  return `<svg class="compass" viewBox="0 0 100 100">
    <g data-rose>
      <g class="ticks">${t}</g>
      <text x="50" y="27" class="north">N</text>
    </g>
    <g data-ptr><path d="M50 22 L57 60 L50 54 L43 60 Z" class="pointer"/></g>
    <g data-way style="display:none"><path d="M50 3 L54.5 12 H45.5 Z" class="way"/></g>
  </svg>`;
}

const bar = (key, icon, label) => `
  <div class="tank" data-g="${key}">
    <span class="ico">${ICON[icon]}</span>
    <span class="lbl">${label}</span>
    <span class="bar"><span class="fill"></span></span>
    <span class="num"></span>
  </div>`;

export class Dashboard {
  constructor(root) {
    this.root = root;
    const gears = CFG.gears
      .map((g, i) => {
        const id = i - CFG.gearOffset;
        const label = id === -1 ? 'R' : id === 0 ? 'N' : String(id);
        return `<div class="notch ${id >= 3 ? 'dear' : ''}" data-gear="${id}"><span>${label}</span></div>`;
      })
      .reverse()
      .join('');
    root.innerHTML = `
      <div class="console">
        <div class="mod tele">
          <h4>Engine</h4>
          <div class="notches">${gears}<div class="lever" data-lever></div></div>
        </div>
        <div class="mod spd"><h4>Knots</h4>${speedDial()}<div class="gname" data-gname></div></div>
        <div class="mod hlm"><h4>Helm</h4>${helmWheel()}<div class="sides"><span>Port</span><span data-helmtext></span><span>Stbd</span></div></div>
        <div class="mod hold">
          <h4 data-shipname></h4>
          ${bar('fuel', 'fuel', 'Fuel')}
          ${bar('provisions', 'food', 'Food')}
          ${bar('tank', 'crab', 'Tank')}
          <div class="tank cagerow"><span class="ico">${ICON.cage}</span><span class="lbl">Cages</span><span class="pips" data-pips></span></div>
        </div>
        <div class="mod cmp"><h4>Heading</h4>${compass()}<div class="gname" data-bearing></div></div>
      </div>`;
    this.$ = (s) => root.querySelector(s);
    this.needle = this.$('[data-needle]');
    this.wheel = this.$('[data-wheel]');
    this.rudder = this.$('[data-rudder]');
    this.speedText = this.$('[data-speed]');
    this.gname = this.$('[data-gname]');
    this.helmText = this.$('[data-helmtext]');
    this.rose = this.$('[data-rose]');
    this.ptr = this.$('[data-ptr]');
    this.way = this.$('[data-way]');
    this.bearing = this.$('[data-bearing]');
    this.lever = this.$('[data-lever]');
    this.shipname = this.$('[data-shipname]');
    this.pips = this.$('[data-pips]');
    this.notches = [...root.querySelectorAll('[data-gear]')];
    this.lastPips = '';
    this.lastGear = null;
    this.tanks = {};
    for (const k of ['fuel', 'provisions', 'tank']) {
      const el = this.$(`[data-g="${k}"]`);
      this.tanks[k] = { el, fill: el.querySelector('.fill'), num: el.querySelector('.num'), last: '' };
    }
  }

  gauge(key, val, max, lowIsBad) {
    const t = this.tanks[key];
    const f = Math.max(0, val / max);
    t.fill.style.width = `${Math.min(100, f * 100)}%`;
    const text = `${Math.round(val)}/${max}`;
    if (text !== t.last) {
      t.num.textContent = text;
      t.last = text;
    }
    t.el.classList.toggle('low', lowIsBad ? f < CFG.lowResource : f >= 1);
  }

  update(game, yaw = 0) {
    const s = game.s;
    const ship = s.ship;
    const top = game.topSpeed;
    const frac = Math.min(1, Math.abs(ship.speed) / Math.max(1, top));
    this.needle.setAttribute('transform', `rotate(${(-110 + frac * 220).toFixed(1)} 50 52)`);
    this.speedText.textContent = Math.abs(ship.speed).toFixed(1);
    if (this.lastGear !== ship.gear) {
      this.lastGear = ship.gear;
      this.gname.textContent = game.gear.name;
      this.notches.forEach((n) => n.classList.toggle('on', Number(n.dataset.gear) === ship.gear));
      const idx = this.notches.findIndex((n) => Number(n.dataset.gear) === ship.gear);
      this.lever.style.setProperty('--i', idx);
    }

    // A (positive helm) turns to port, so the wheel spins anticlockwise.
    const helm = ship.helm ?? 0;
    this.wheel.setAttribute('transform', `rotate(${(-helm * 160).toFixed(1)} 50 50)`);
    this.rudder.setAttribute('transform', `translate(${(-ship.rudder * 42).toFixed(1)} 0)`);
    const deg = Math.round(Math.abs(ship.rudder) * 35);
    const hText = deg === 0 ? 'Midships' : `${deg}° ${ship.rudder > 0 ? 'port' : 'stbd'}`;
    if (this.helmText.textContent !== hText) this.helmText.textContent = hText;

    // Compass: world -Z is north. The dial is drawn as the camera sees the world, so
    // its N and the arrow point exactly where north and the bow point on screen.
    const DEG = 180 / Math.PI;
    const onScreen = (a) => Math.atan2(Math.sin(a - yaw), -Math.cos(a - yaw)) * DEG;
    const bearing = (((180 - ship.heading * DEG) % 360) + 360) % 360;
    this.rose.setAttribute('transform', `rotate(${(yaw * DEG).toFixed(1)} 50 50)`);
    this.ptr.setAttribute('transform', `rotate(${onScreen(ship.heading).toFixed(1)} 50 50)`);
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let line = `${String(Math.round(bearing) % 360).padStart(3, '0')}° ${dirs[Math.round(bearing / 45) % 8]}`;
    if (s.waypoint) {
      const dx = s.waypoint.x - ship.x;
      const dz = s.waypoint.z - ship.z;
      this.way.style.display = '';
      this.way.setAttribute('transform', `rotate(${onScreen(Math.atan2(dx, dz)).toFixed(1)} 50 50)`);
      line = `WP ${Math.round(Math.hypot(dx, dz))} m`;
    } else this.way.style.display = 'none';
    if (this.bearing.textContent !== line) this.bearing.textContent = line;

    this.gauge('fuel', s.fuel, game.maxFuel, true);
    this.gauge('provisions', s.provisions, game.maxProvisions, true);
    this.gauge('tank', s.crabs, game.maxTank, false);
    const name = game.shipClass.name;
    if (this.shipname.textContent !== name) this.shipname.textContent = name;
    const pipKey = `${game.cagesAboard}/${game.maxCages}`;
    if (pipKey !== this.lastPips) {
      this.lastPips = pipKey;
      let html = '';
      for (let i = 0; i < game.maxCages; i++) html += `<i class="${i < game.cagesAboard ? 'in' : ''}"></i>`;
      this.pips.innerHTML = html;
    }
  }
}
