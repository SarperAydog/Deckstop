// Test bench on the left edge of the screen (F9 or the tab). Values marked as tuning
// live in CFG, survive a reload, and can be copied out to be made permanent.
import { CFG } from '../config.js';

const STORE = 'deckstop.debug.v1';

const pathGet = (path) => path.split('.').reduce((o, k) => o[k], CFG);
const pathSet = (path, v) => {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], CFG)[last] = v;
};

// Everything here is written straight into CFG, which the sim reads every step.
const TUNING = [
  ['Ship feel', [
    ['gears.5.speed', 'Gear 4 speed', 2, 26, 0.5],
    ['gears.4.speed', 'Gear 3 speed', 1, 20, 0.5],
    ['gears.3.speed', 'Gear 2 speed', 0.5, 14, 0.25],
    ['gears.2.speed', 'Gear 1 speed', 0.25, 8, 0.25],
    ['gears.0.speed', 'Astern speed', -8, -0.25, 0.25],
    ['accel', 'Acceleration', 0.1, 8, 0.1],
    ['brake', 'Braking', 0.1, 12, 0.1],
    ['turnRate', 'Turn rate', 0.1, 2.5, 0.01],
    ['yawLag', 'Turn inertia (s)', 0, 4, 0.05],
    ['helmRate', 'Wheel speed', 0.1, 3, 0.05],
    ['rudderRate', 'Rudder follow', 0.1, 5, 0.05],
    ['dropMaxSpeed', 'Max drop speed', 0.5, 12, 0.1],
  ]],
  ['Time and soak', [
    ['soakPeak', 'Soak to peak (s)', 5, 600, 5],
    ['escapeTime', 'Escape time (s)', 10, 1200, 10],
    ['escapeFloor', 'Escape floor', 0, 1, 0.05],
    ['cageCapMin', 'Cage crabs, min', 0, 60, 1],
    ['cageCapDensity', 'Cage crabs, density', 0, 120, 1],
    ['provisionRate', 'Rations per second', 0, 1, 0.005],
    ['stormBuildSeconds', 'Storm build (s)', 5, 300, 5],
  ]],
  ['Economy', [
    ['crabPrice', 'Crab price', 1, 50, 1],
    ['fuelPrice', 'Fuel price', 0, 10, 0.1],
    ['provisionPrice', 'Ration price', 0, 10, 0.1],
    ['tune.burn', 'Fuel burn ×', 0, 5, 0.05],
    ['towBase', 'Tow base cost', 0, 500, 10],
    ['deckhandEfficiency', 'Deckhand yield', 0.1, 1.5, 0.05],
  ]],
];

export class DebugPanel {
  constructor({ root, game, world, view }) {
    this.game = game;
    this.world = world;
    this.view = view;
    this.open = false;
    this.bound = [];
    this.last = 0;
    this.frames = 0;
    this.fps = 0;
    this.fpsAt = performance.now();
    this.defaults = {};
    for (const [, rows] of TUNING) for (const [p] of rows) this.defaults[p] = pathGet(p);
    this.saved = {};
    try {
      this.saved = JSON.parse(localStorage.getItem(STORE) ?? '{}');
      for (const [p, v] of Object.entries(this.saved)) if (p in this.defaults) pathSet(p, v);
    } catch {
      this.saved = {};
    }

    const el = root.ownerDocument.createElement('div');
    el.className = 'dbg';
    root.appendChild(el);
    this.el = el;
    this.build();
    el.addEventListener('input', (e) => this.onInput(e));
    el.addEventListener('change', (e) => {
      this.onInput(e);
      e.target.blur?.(); // hand the keyboard straight back to the helm
    });
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('keydown', (e) => e.stopPropagation());
  }

  toggle(state = !this.open) {
    this.open = state;
    this.el.classList.toggle('on', state);
  }

  // ---- markup ---------------------------------------------------------------
  slider(id, label, min, max, step, get, set, kind = 'live') {
    this.bound.push({ id, get, set, kind });
    return `<label class="dbg-row"><span>${label}</span>
      <input type="range" data-dbg="${id}" min="${min}" max="${max}" step="${step}"/>
      <input type="number" data-dbg="${id}" step="${step}"/></label>`;
  }

  check(id, label, get, set) {
    this.bound.push({ id, get, set, kind: 'check' });
    return `<label class="dbg-row dbg-check"><span>${label}</span><input type="checkbox" data-dbg="${id}"/></label>`;
  }

  build() {
    const g = this.game;
    const s = g.s;
    const v = this.view;
    const act = (a, label) => `<button class="btn" data-dbg-act="${a}">${label}</button>`;
    const section = (title, body, open = false) => `<details ${open ? 'open' : ''}><summary>${title}</summary>${body}</details>`;

    let html = `<div class="dbg-head"><b>Debug</b><span data-dbg-read></span><button class="close" data-dbg-act="close" aria-label="Close">×</button></div><div class="dbg-body">`;

    html += section('Clock', `
      ${this.slider('timeScale', 'Sim speed ×', 0, 30, 0.5, () => g.timeScale, (x) => { g.timeScale = x; })}
      <div class="tools">${act('time1', '×1')}${act('time5', '×5')}${act('time20', '×20')}${act('freeze', 'Freeze')}</div>`, true);

    for (const [title, rows] of TUNING) {
      const body = rows
        .map(([p, label, min, max, step]) => this.slider(`cfg:${p}`, label, min, max, step, () => pathGet(p), (x) => {
          pathSet(p, x);
          this.saved[p] = x;
          this.persist();
        }))
        .join('');
      html += section(title, body, title === 'Ship feel');
    }

    html += section('Resources', `
      ${this.slider('money', 'Money', -150, 50000, 10, () => s.money, (x) => { s.money = x; })}
      ${this.slider('fuel', 'Fuel', 0, 500, 1, () => s.fuel, (x) => { s.fuel = Math.min(x, g.maxFuel); })}
      ${this.slider('prov', 'Provisions', 0, 500, 1, () => s.provisions, (x) => { s.provisions = Math.min(x, g.maxProvisions); })}
      ${this.slider('crabs', 'Crabs in tank', 0, 1000, 1, () => s.crabs, (x) => { s.crabs = Math.min(x, g.maxTank); })}
      <div class="tools">${act('fill', 'Fill everything')}${act('rich', '+$10,000')}${act('emptyFuel', 'Empty fuel')}${act('emptyProv', 'Empty rations')}${act('fullTank', 'Full tank')}</div>`, true);

    const ships = Object.entries(CFG.ships).map(([id, c]) => `<option value="${id}">${c.name}</option>`).join('');
    const capacity = [['cages', 'Cages', 1, 24, 1], ['tank', 'Crab tank', 5, 1000, 5], ['fuel', 'Fuel tank', 5, 1000, 5], ['provisions', 'Provisions', 5, 1000, 5], ['radar', 'Radar range', 4, 150, 1], ['speed', 'Speed ×', 0.2, 3, 0.05], ['turn', 'Handling ×', 0.2, 3, 0.05], ['burn', 'Burn ×', 0.1, 3, 0.05]]
      .map(([k, label, min, max, step]) => this.slider(`cls:${k}`, label, min, max, step, () => g.shipClass[k], (x) => { g.shipClass[k] = x; }))
      .join('');
    const refits = Object.entries(CFG.upgrades)
      .map(([k, u]) => this.slider(`lvl:${k}`, `${u.label} level`, 0, u.cost.length, 1, () => s.levels[k], (x) => { s.levels[k] = x; }))
      .join('');
    html += section('Ship and crew', `
      <label class="dbg-row dbg-check"><span>Boat</span><select data-dbg-ship>${ships}</select></label>
      <p class="dbg-note">Sliders below change the boat you are on.</p>
      ${capacity}
      ${refits}
      ${this.check('deckhand', 'Deckhand aboard', () => s.crew.deckhand, (x) => { s.crew.deckhand = x; })}
      ${this.check('captain', 'Captain aboard', () => s.crew.captain, (x) => { s.crew.captain = x; })}
      <div class="tools">${act('ownAll', 'Own every boat')}</div>`);

    html += section('Cages', `
      <div class="tools">${act('cageHere', 'Drop one here')}${act('cageRing', 'Fill all slots')}${act('cageReady', 'All ready')}${act('cageLate', 'All escaping')}${act('cageClear', 'Remove all')}</div>`, true);

    html += section('Place and weather', `
      <div class="tools">${act('tpPort', 'To berth')}${act('tpSea', 'Open sea')}${act('tpAhead', 'Jump 60 ahead')}${act('stop', 'Dead stop')}${act('tow', 'Call tow')}</div>
      <div class="tools">${act('storm', 'Storm now')}${act('calm', 'Calm')}${act('overcast', 'Overcast')}${act('voyage', 'Voyage ends in 10 s')}</div>`);

    html += section('Camera and picture', `
      ${this.slider('zoom', 'Zoom', 0.5, 3.2, 0.05, () => v.userZoom, (x) => { v.userZoom = x; })}
      ${this.slider('pitch', 'Pitch', 0.42, 1.05, 0.01, () => v.pitch, (x) => { v.pitch = x; })}
      ${this.slider('yaw', 'Yaw', -3.2, 3.2, 0.01, () => v.yaw, (x) => { v.yaw = x; })}
      ${this.check('outlines', 'Outlines', () => v.settings.outlines, (x) => { v.settings.outlines = x; })}
      ${this.check('tilt', 'Miniature lens', () => v.settings.tiltShift, (x) => { v.settings.tiltShift = x; })}
      ${this.check('snow', 'Snowfall', () => v.settings.snow, (x) => { v.settings.snow = x; })}
      <div class="tools">${act('hideUi', 'Hide interface 10 s')}</div>`);

    html += `<div class="tools dbg-foot">${act('copy', 'Copy tuning')}${act('reset', 'Reset tuning')}</div><textarea class="dbg-out" readonly data-dbg-out></textarea></div>`;

    this.el.innerHTML = `<button class="dbg-tab" data-dbg-act="toggle" title="Debug (F9)">Debug</button><div class="dbg-panel paper">${html}</div>`;
    this.inputs = new Map();
    for (const b of this.bound) this.inputs.set(b.id, { ...b, els: [...this.el.querySelectorAll(`[data-dbg="${b.id}"]`)] });
    this.read = this.el.querySelector('[data-dbg-read]');
    this.shipSelect = this.el.querySelector('[data-dbg-ship]');
    this.out = this.el.querySelector('[data-dbg-out]');
  }

  persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.saved));
    } catch {
      /* Private mode: tuning lasts for this session. */
    }
  }

  // ---- input ----------------------------------------------------------------
  onInput(e) {
    const t = e.target;
    if (t.dataset.dbgShip !== undefined) {
      this.forceShip(t.value);
      return;
    }
    const b = this.inputs.get(t.dataset.dbg);
    if (!b) return;
    if (b.kind === 'check') b.set(t.checked);
    else {
      const x = parseFloat(t.value);
      if (!Number.isNaN(x)) b.set(x);
    }
  }

  forceShip(id) {
    const s = this.game.s;
    if (!s.fleet.owned.includes(id)) s.fleet.owned.push(id);
    s.fleet.current = id;
    s.fuel = Math.min(s.fuel, this.game.maxFuel);
    s.provisions = Math.min(s.provisions, this.game.maxProvisions);
    s.crabs = Math.min(s.crabs, this.game.maxTank);
  }

  moveShip(x, z, docked = false) {
    const g = this.game;
    const { ship } = g.s;
    ship.x = x;
    ship.z = z;
    ship.docked = docked;
    ship.speed = 0;
    ship.gear = 0;
    ship.yawRate = 0;
    ship.berthing = false;
    ship.mooredHeading = null;
    g.s.stranded = false;
    g.prev = { x, z, heading: ship.heading };
    g.path = null;
  }

  openSea() {
    const { world } = this;
    const { ship } = this.game.s;
    for (let r = 70; r < 310; r += 10) {
      for (let a = 0; a < 6.28; a += 0.26) {
        const x = ship.x + Math.sin(a) * r;
        const z = ship.z - Math.cos(a) * r;
        const b = world.bounds;
        if (x > b.x0 + 14 && x < b.x1 - 14 && z > b.z0 + 14 && z < b.z1 - 14 && world.shoreDistance(x, z) > 20) return { x, z };
      }
    }
    return { x: 40, z: -120 };
  }

  onClick(e) {
    const t = e.target.closest('[data-dbg-act]');
    if (!t) return;
    const g = this.game;
    const s = g.s;
    const { ship } = s;
    const addCage = (x, z) => {
      s.cages.push({ id: s.nextCageId++, x, z, t0: s.t, density: this.world.density(x, z), ready: false });
    };
    switch (t.dataset.dbgAct) {
      case 'toggle':
        this.toggle();
        break;
      case 'close':
        this.toggle(false);
        break;
      case 'time1':
        g.timeScale = 1;
        break;
      case 'time5':
        g.timeScale = 5;
        break;
      case 'time20':
        g.timeScale = 20;
        break;
      case 'freeze':
        g.timeScale = 0;
        break;
      case 'fill':
        s.fuel = g.maxFuel;
        s.provisions = g.maxProvisions;
        s.stranded = false;
        break;
      case 'rich':
        s.money += 10000;
        break;
      case 'emptyFuel':
        s.fuel = 0.5;
        break;
      case 'emptyProv':
        s.provisions = 0.5;
        break;
      case 'fullTank':
        s.crabs = g.maxTank;
        break;
      case 'ownAll':
        s.fleet.owned = Object.keys(CFG.ships);
        break;
      case 'cageHere':
        addCage(ship.x - Math.sin(ship.heading) * 8, ship.z - Math.cos(ship.heading) * 8);
        break;
      case 'cageRing': {
        const n = g.cagesAboard;
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * Math.PI * 2;
          addCage(ship.x + Math.sin(a) * 18, ship.z + Math.cos(a) * 18);
        }
        break;
      }
      case 'cageReady':
        for (const c of s.cages) c.t0 = s.t - CFG.soakPeak - 1;
        break;
      case 'cageLate':
        for (const c of s.cages) c.t0 = s.t - CFG.soakPeak - CFG.escapeTime * 0.5;
        break;
      case 'cageClear':
        s.cages = [];
        break;
      case 'tpPort':
        ship.heading = this.world.port.heading;
        this.moveShip(this.world.port.x, this.world.port.z, true);
        break;
      case 'tpSea': {
        const p = this.openSea();
        this.moveShip(p.x, p.z);
        break;
      }
      case 'tpAhead':
        this.moveShip(ship.x + Math.sin(ship.heading) * 60, ship.z + Math.cos(ship.heading) * 60);
        break;
      case 'stop':
        ship.speed = 0;
        ship.gear = 0;
        ship.helm = 0;
        ship.rudder = 0;
        ship.yawRate = 0;
        break;
      case 'tow':
        g.callTow();
        break;
      case 'storm':
        s.voyage.ringing = true;
        s.weather.storm = 1;
        s.weather.overcast = 1;
        break;
      case 'calm':
        s.voyage.ringing = false;
        s.voyage.snoozeUntil = null;
        s.weather.storm = 0;
        s.weather.overcast = 0;
        s.weather.overcastUntil = 0;
        break;
      case 'overcast':
        s.weather.overcast = 1;
        s.weather.overcastUntil = s.t + 120;
        break;
      case 'voyage':
        s.voyage.deadline = s.t + 10;
        s.voyage.expired = false;
        break;
      case 'hideUi': {
        const hud = this.el.parentElement;
        hud.style.visibility = 'hidden';
        setTimeout(() => {
          hud.style.visibility = '';
        }, 10000);
        break;
      }
      case 'copy': {
        const text = JSON.stringify(this.saved, null, 2);
        this.out.value = text;
        this.out.style.display = 'block';
        this.el.ownerDocument.defaultView.navigator.clipboard?.writeText(text).catch(() => {});
        break;
      }
      case 'reset':
        for (const [p, x] of Object.entries(this.defaults)) pathSet(p, x);
        this.saved = {};
        this.persist();
        this.out.style.display = 'none';
        break;
      default:
    }
  }

  // ---- frame ----------------------------------------------------------------
  update() {
    this.frames++;
    const now = performance.now();
    if (now - this.fpsAt >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
    }
    if (!this.open || now - this.last < 120) return;
    this.last = now;
    const { ship, t } = this.game.s;
    this.read.textContent = `${this.fps} fps · t ${Math.floor(t)} · ${ship.x.toFixed(0)}, ${ship.z.toFixed(0)} · ${ship.speed.toFixed(1)} kn`;
    const active = this.el.ownerDocument.activeElement;
    for (const b of this.inputs.values()) {
      const val = b.get();
      for (const el of b.els) {
        if (el === active) continue;
        if (b.kind === 'check') el.checked = !!val;
        else {
          const str = String(Math.round(val * 1000) / 1000);
          if (el.value !== str) el.value = str;
        }
      }
    }
    if (this.shipSelect !== active) this.shipSelect.value = this.game.s.fleet.current;
  }
}
