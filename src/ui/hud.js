// Everything drawn in DOM over the game: bridge console, menus, harbour, alarms.
// Sections re-render only when their HTML changes, so buttons stay clickable.
import { CFG } from '../config.js';
import { Dashboard } from './dash.js';
import { DebugPanel } from './debug.js';
import { fmtTime, MapPanel } from './map.js';
import { Minigame } from './minigame.js';
import { PRESETS } from './modes.js';

const SETTINGS_KEY = 'deckstop.settings.v1';
export const DEFAULT_SETTINGS = { volume: 80, muted: false, quality: 'high', tiltShift: true, outlines: true, snow: true, labels: true, uiScale: 100 };

const ICONS = {
  taskbar: '<svg viewBox="0 0 18 14"><rect x="1" y="9" width="16" height="4" fill="currentColor"/><rect x="1" y="1" width="16" height="12" fill="none" stroke="currentColor"/></svg>',
  small: '<svg viewBox="0 0 18 14"><rect x="9" y="7" width="8" height="6" fill="currentColor"/><rect x="1" y="1" width="16" height="12" fill="none" stroke="currentColor"/></svg>',
  large: '<svg viewBox="0 0 18 14"><rect x="1" y="1" width="16" height="12" fill="currentColor"/></svg>',
  chart: '<svg viewBox="0 0 18 18"><path d="M2 4l4.6-2 4.8 2L16 2v12l-4.6 2-4.8-2L2 16zM6.6 2v12M11.4 4v12" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  radar: '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="9" cy="9" r="3.5" fill="none" stroke="currentColor"/><path d="M9 9l5-5" stroke="currentColor" stroke-width="1.4"/></svg>',
  clock: '<svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 4.5V9l3 2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  pause: '<svg viewBox="0 0 18 18"><rect x="4.5" y="3" width="3" height="12" fill="currentColor"/><rect x="10.5" y="3" width="3" height="12" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 18 18"><path d="M3 7v4h3l4 3V4L6 7zM12.5 6.5a4 4 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
};

// Mirrored ornament above headings: one motif, flipped about the centre.
const ORNAMENT = `<svg class="orn" viewBox="0 0 220 16" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1">
    <path id="o" d="M110 8h-22l-5-5-5 5 5 5 5-5M78 8H12M36 8l-4-4M36 8l-4 4M52 8l-4-4M52 8l-4 4"/>
    <path d="M110 8h22l5-5 5 5-5 5-5-5M142 8h66M184 8l4-4M184 8l4 4M168 8l4-4M168 8l4 4"/>
  </g>
  <path d="M110 3l5 5-5 5-5-5z" fill="currentColor"/>
</svg>`;

const KEYS = [
  ['W / S', 'Shift the engine up or down'],
  ['A / D', 'Turn the wheel. It stays where you leave it'],
  ['X', 'Bring the wheel back to midships'],
  ['Space', 'Neutral and brake'],
  ['E', 'Drop a cage (gear 1 or slower)'],
  ['F / C', 'Haul a cage yourself, or leave it to the deckhand'],
  ['P', 'Dock, or open the harbour'],
  ['M', 'Chart: cages, waypoint and orders'],
  ['R', 'Radar heatmap of the crab grounds'],
  ['V', 'Voyage plan: how long your break is'],
  ['G / H', 'With a captain: resume the chain, or sail home'],
  ['T', 'Call the tow ship when out of fuel'],
  ['1 / 2 / 3', 'Taskbar strip, small window, full view'],
  ['Right drag, wheel', 'Turn the camera, zoom'],
  ['Esc', 'Pause menu'],
];

export class Hud {
  constructor({ root, game, world, view, audio, modes, portraits }) {
    this.root = root;
    this.game = game;
    this.world = world;
    this.view = view;
    this.audio = audio;
    this.modes = modes;
    this.portraits = portraits;
    this.portOpen = game.s.ship.docked;
    this.mapOpen = false;
    this.voyageOpen = false;
    this.confirmExit = false;
    this.menu = 'title'; // title, pause or null
    this.menuPage = 'main';
    this.confirmNew = false;
    this.portTab = 'market';
    this.cageEls = new Map();
    this.html = {};
    this.settings = this.loadSettings();

    root.innerHTML = `
      <div class="plate top-left">
        <div class="purse"></div>
        <div class="status"></div>
      </div>
      <div class="top-right">
        <div class="presets">${Object.keys(PRESETS).map((k) => `<button class="btn tiny" data-preset="${k}">${k}</button>`).join('')}</div>
        <div class="iconbar large-only">
          <button class="ibtn" data-ui="map" title="Chart (M)">${ICONS.chart}</button>
          <button class="ibtn" data-ui="radar" data-radar title="Radar (R)">${ICONS.radar}</button>
          <button class="ibtn" data-ui="voyage" title="Voyage plan (V)">${ICONS.clock}</button>
        </div>
        <div class="iconbar">
          <button class="ibtn" data-mode="taskbar" title="Taskbar strip (1)">${ICONS.taskbar}</button>
          <button class="ibtn" data-mode="small" title="Small window (2)">${ICONS.small}</button>
          <button class="ibtn" data-mode="large" title="Full view (3)">${ICONS.large}</button>
        </div>
        <button class="ibtn pausebtn" data-ui="pause" title="Pause (Esc)">${ICONS.pause}</button>
      </div>
      <div class="labels"></div>
      <div class="hint"></div>
      <div class="actions" data-actions></div>
      <div class="dash"></div>
      <div class="toasts"></div>
      <div data-port class="hud-panel"></div>
      <div data-map class="hud-panel"></div>
      <div data-minigame class="hud-panel"></div>
      <div data-dialog class="hud-panel"></div>
      <div data-menu></div>`;

    this.$ = (sel) => root.querySelector(sel);
    this.dash = new Dashboard(this.$('.dash'));
    this.mapPanel = new MapPanel({ game, world, audio, view });
    this.minigame = new Minigame({ container: this.$('[data-minigame]'), game, audio, onClose: () => {} });

    this.debug = new DebugPanel({ root, game, world, view });

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('input', (e) => this.onInput(e));
    this.applySettings();
    this.renderMenu();
  }

  get showTitle() {
    return this.menu === 'title';
  }
  get paused() {
    return this.menu !== null;
  }

  // ---- settings -------------------------------------------------------------
  loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  applySettings() {
    const st = this.settings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(st));
    } catch {
      /* Private mode: settings last for this session only. */
    }
    this.audio.setVolume(st.muted ? 0 : st.volume / 100);
    this.view.settings.tiltShift = st.tiltShift;
    this.view.settings.outlines = st.outlines;
    this.view.settings.snow = st.snow;
    this.view.preferLow = st.quality === 'low';
    if (this.modes.mode === 'large') this.view.setQuality(st.quality);
    this.root.style.setProperty('--ui', st.uiScale / 100);
  }

  // ---- menus ----------------------------------------------------------------
  openPause() {
    this.menu = 'pause';
    this.menuPage = 'main';
    this.confirmNew = false;
    this.setTurn(0);
    this.root.classList.add('is-paused');
    this.renderMenu();
  }

  closeMenu() {
    this.menu = null;
    this.menuPage = 'main';
    this.root.classList.remove('is-paused', 'on-title');
    this.view.showcase = false;
    this.renderMenu();
  }

  menuBack() {
    this.menuPage = 'main';
    this.confirmNew = false;
    this.renderMenu();
  }

  renderMenu() {
    const host = this.$('[data-menu]');
    this.root.classList.toggle('on-title', this.menu === 'title');
    this.view.showcase = this.menu === 'title';
    if (!this.menu) {
      host.innerHTML = '';
      return;
    }
    const title = this.menu === 'title';
    const body = {
      main: () => this.menuMain(title),
      howto: () => this.menuHowto(),
      settings: () => this.menuSettings(),
      log: () => this.menuLog(),
      credits: () => this.menuCredits(),
    }[this.menuPage]();
    if (title) {
      host.innerHTML = `
        <div class="title-screen">
          <div class="title-col">
            <div class="logo">
              ${ORNAMENT}
              <h1>Deck<span>·</span>Stop</h1>
              <p>Crabbing the Arctic, one coffee break at a time</p>
              ${ORNAMENT}
            </div>
            ${body}
          </div>
          <div class="title-foot">An idle crabbing game for the corner of your screen</div>
        </div>`;
    } else {
      host.innerHTML = `
        <div class="pause-screen">
          <div class="paper panel pause-panel">
            ${ORNAMENT}
            <h2>${{ main: 'Paused', howto: 'How to Play', settings: 'Settings', log: "Skipper's Log", credits: 'Credits' }[this.menuPage]}</h2>
            ${body}
          </div>
        </div>`;
    }
  }

  menuMain(title) {
    const fresh = this.game.s.t < 1;
    const item = (ui, label, sub = '') => `<button class="menu-item" data-ui="${ui}"><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
    if (this.confirmNew) {
      return `<div class="menu-list confirm">
        <p>Start over? Your boats, money and crew will be lost.</p>
        ${item('newGame', 'Yes, new voyage')}
        ${item('menuBack', 'Keep my save')}
      </div>`;
    }
    if (title) {
      const s = this.game.s;
      return `<div class="menu-list">
        ${fresh ? item('begin', 'Set out', 'Begin your first voyage') : item('begin', 'Continue', `${this.game.shipClass.name} · $${Math.round(s.money)}`)}
        ${fresh ? '' : item('askNew', 'New voyage')}
        ${item('page:howto', 'How to play')}
        ${item('page:settings', 'Settings')}
        ${item('page:credits', 'Credits')}
      </div>`;
    }
    return `<div class="menu-list">
      ${item('resume', 'Resume')}
      ${item('page:log', "Skipper's log")}
      ${item('page:howto', 'How to play')}
      ${item('page:settings', 'Settings')}
      ${item('quit', 'Save and quit to title')}
    </div>`;
  }

  backRow() {
    return `<div class="menu-list back"><button class="menu-item" data-ui="menuBack"><span>Back</span></button></div>`;
  }

  menuHowto() {
    const rows = KEYS.map(([k, d]) => `<div class="keyrow"><kbd>${k}</kbd><span>${d}</span></div>`).join('');
    return `<div class="sheet ${this.menu === 'title' ? 'paper' : ''}">
      <p class="lead">Sail out, drop your cages on good ground, let them soak, haul them up and sell the catch in port. Hire a deckhand and a captain and the boat keeps working while you do.</p>
      <div class="keygrid">${rows}</div>
    </div>${this.backRow()}`;
  }

  menuSettings() {
    const st = this.settings;
    const toggle = (key, label, sub) => `<label class="set-row"><span>${label}<small>${sub}</small></span><input type="checkbox" data-set="${key}" ${st[key] ? 'checked' : ''}/></label>`;
    return `<div class="sheet ${this.menu === 'title' ? 'paper' : ''}">
      <h3>Sound</h3>
      <label class="set-row"><span>Volume</span><input type="range" min="0" max="100" value="${st.volume}" data-set="volume"/></label>
      ${toggle('muted', 'Mute', 'Silence everything')}
      <h3>Picture</h3>
      <label class="set-row"><span>Quality<small>Low also drops the miniature lens effect</small></span>
        <select data-set="quality"><option value="high" ${st.quality === 'high' ? 'selected' : ''}>High</option><option value="low" ${st.quality === 'low' ? 'selected' : ''}>Low</option></select></label>
      ${toggle('tiltShift', 'Miniature lens', 'Soft focus at the top and bottom of the frame')}
      ${toggle('outlines', 'Outlines', 'One-pixel edge around models')}
      ${toggle('snow', 'Snowfall', 'Light flakes in clear weather')}
      <h3>Interface</h3>
      <label class="set-row"><span>Interface size</span><input type="range" min="85" max="125" step="5" value="${st.uiScale}" data-set="uiScale"/></label>
      ${toggle('labels', 'Cage timers', 'Show soak time over each buoy')}
    </div>${this.backRow()}`;
  }

  menuLog() {
    const g = this.game;
    const s = g.s;
    const mins = Math.floor(s.t / 60);
    const row = (a, b) => `<div class="log-row"><span>${a}</span><strong>${b}</strong></div>`;
    return `<div class="sheet">
      ${row('Time at the helm', `${Math.floor(mins / 60)} h ${mins % 60} min`)}
      ${row('Crabs landed', s.stats.crabsLanded)}
      ${row('Cages pulled', s.stats.cagesPulled)}
      ${row('Earned at market', `$${Math.round(s.stats.earned)}`)}
      ${row('Boats in your fleet', s.fleet.owned.map((id) => CFG.ships[id].name).join(', '))}
      ${row('Crew', [s.crew.captain && 'Captain', s.crew.deckhand && 'Deckhand'].filter(Boolean).join(', ') || 'Just you')}
    </div>${this.backRow()}`;
  }

  menuCredits() {
    return `<div class="sheet ${this.menu === 'title' ? 'paper' : ''}">
      <p class="lead">Deckstop. Models, shaders and sounds are all generated in code.</p>
      <p>The look follows the techniques Oskar Stålberg described for Bad North: voxel ambient occlusion, inverted-hull outlines, mirrored reflections and borders instead of textures.</p>
      <p>Built with three.js. Set in Alegreya by Juan Pablo del Peral.</p>
    </div>${this.backRow()}`;
  }

  // ---- input ---------------------------------------------------------------
  onChange(e) {
    if (e.target.matches('[data-voyage-input]')) {
      const v = parseFloat(e.target.value);
      if (v > 0) this.pendingVoyage = v;
    }
    this.onInput(e);
  }

  onInput(e) {
    const key = e.target.dataset?.set;
    if (!key) return;
    const t = e.target;
    this.settings[key] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? Number(t.value) : t.value;
    this.applySettings();
  }

  onClick(e) {
    const t = e.target.closest('[data-ui],[data-mode],[data-preset],[data-remove],[data-upgrade],[data-hire],[data-buy],[data-tab],[data-buyship],[data-board]');
    if (!t) return;
    this.audio.unlock();
    this.audio.click();
    const g = this.game;
    const d = t.dataset;
    if (d.mode) return void this.modes.set(d.mode);
    if (d.preset) return void this.modes.setPreset(d.preset);
    if (d.remove !== undefined) return void g.removeOrder(Number(d.remove));
    if (d.upgrade) return void g.upgrade(d.upgrade);
    if (d.hire) return void g.hire(d.hire);
    if (d.buyship) return void g.buyShip(d.buyship);
    if (d.board) return void g.boardShip(d.board);
    if (d.tab) {
      this.portTab = d.tab;
      return;
    }
    if (d.buy) {
      const [key, amt] = d.buy.split(':');
      return void g.buy(key, amt === 'fill' ? Infinity : Number(amt));
    }
    this.action(d.ui);
  }

  action(name) {
    const g = this.game;
    const s = g.s;
    if (name?.startsWith('page:')) {
      this.menuPage = name.slice(5);
      this.renderMenu();
      return;
    }
    switch (name) {
      case 'begin':
      case 'resume':
        this.closeMenu();
        break;
      case 'pause':
        this.openPause();
        break;
      case 'menuBack':
        this.menuBack();
        break;
      case 'askNew':
        this.confirmNew = true;
        this.renderMenu();
        break;
      case 'newGame':
        this.onNewGame?.();
        break;
      case 'quit':
        this.onSave?.();
        this.toggleMap(false);
        this.voyageOpen = false;
        this.menu = 'title';
        this.menuPage = 'main';
        this.root.classList.remove('is-paused');
        this.renderMenu();
        break;
      case 'centerHelm':
        g.centerHelm();
        break;
      case 'drop':
        g.dropCage();
        break;
      case 'haul':
        if (g.startMinigame()) this.minigame.start();
        break;
      case 'crew':
        g.collectByCrew();
        break;
      case 'dock':
        g.beginBerthing();
        break;
      case 'radar':
        s.radarOn = !s.radarOn;
        break;
      case 'tow':
        g.callTow();
        break;
      case 'chain':
        g.startChain();
        break;
      case 'home':
        g.returnToPortOrder();
        break;
      case 'map':
        this.toggleMap();
        break;
      case 'closeMap':
        this.toggleMap(false);
        break;
      case 'openPort':
        this.portOpen = true;
        break;
      case 'openUpgrades':
        this.portTab = 'refit';
        this.portOpen = true;
        break;
      case 'closePort':
        this.portOpen = false;
        break;
      case 'sail':
        this.commitVoyage();
        if (g.setSail()) this.portOpen = false;
        break;
      case 'sell':
        g.sellCrabs();
        break;
      case 'voyage':
        this.voyageOpen = !this.voyageOpen;
        break;
      case 'voyageSave':
        this.commitVoyage();
        this.voyageOpen = false;
        break;
      case 'voyageCancel':
        this.voyageOpen = false;
        break;
      case 'dismiss':
        g.dismissAlarm();
        break;
      case 'snooze':
        g.snoozeAlarm();
        break;
      case 'changeTime':
        this.voyageOpen = true;
        break;
      case 'exitAutoYes':
        g.exitAutopilot();
        this.confirmExit = false;
        break;
      case 'exitAutoNo':
        this.confirmExit = false;
        break;
      case 'orderPort':
        g.addOrder({ type: 'port' });
        break;
      case 'chainStart':
        if (s.auto.active) g.exitAutopilot();
        else g.startChain();
        break;
      case 'chainLoop':
        s.auto.loop = !s.auto.loop;
        break;
      case 'chainClear':
        g.clearOrders();
        break;
      default:
    }
  }

  commitVoyage() {
    const input = this.root.querySelector('[data-voyage-input]');
    const v = input ? parseFloat(input.value) : this.pendingVoyage;
    if (v > 0) this.game.setVoyage(v);
    this.pendingVoyage = null;
  }

  toggleMap(state = !this.mapOpen) {
    if (this.modes.mode !== 'large') return;
    this.mapOpen = state;
    if (state) this.mapPanel.mount(this.$('[data-map]'));
    else this.mapPanel.unmount();
  }

  onKey(e, down) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return false;
    const g = this.game;
    const k = e.code;
    if (down && !e.repeat && (k === 'F9' || k === 'Backquote')) {
      e.preventDefault();
      this.debug.toggle();
      return true;
    }
    if (!down) {
      if ((k === 'KeyA' && this.turn === 1) || (k === 'KeyD' && this.turn === -1)) this.setTurn(0);
      return false;
    }
    this.audio.unlock();
    if (this.menu) {
      if (k === 'Escape') {
        if (this.menuPage !== 'main' || this.confirmNew) this.menuBack();
        else if (this.menu === 'pause') this.closeMenu();
      }
      return true;
    }
    if (this.minigame.active) {
      if (k === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.minigame.press();
      } else if (k === 'Escape') this.minigame.cancel();
      return true;
    }
    if (k === 'Escape') {
      if (e.repeat) return true;
      // Esc closes whatever is on top. With nothing open it pauses the game.
      if (this.voyageOpen) this.voyageOpen = false;
      else if (this.confirmExit) this.confirmExit = false;
      else if (this.mapOpen) this.toggleMap(false);
      else if (g.s.ship.docked && this.portOpen) this.portOpen = false;
      else this.openPause();
      return true;
    }
    const steering = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyX'].includes(k);
    if (steering && g.s.auto.active) {
      this.confirmExit = true;
      return true;
    }
    if (this.confirmExit) {
      if (k === 'KeyY' || k === 'Enter') this.action('exitAutoYes');
      if (k === 'KeyN') this.action('exitAutoNo');
    }
    switch (k) {
      case 'KeyW':
        if (e.repeat) return true;
        if (g.s.ship.docked) this.action('sail');
        g.shiftGear(1);
        break;
      case 'KeyS':
        if (!e.repeat) g.shiftGear(-1);
        break;
      case 'KeyA':
        this.setTurn(1);
        break;
      case 'KeyD':
        this.setTurn(-1);
        break;
      case 'KeyX':
        g.centerHelm();
        break;
      case 'Space':
        e.preventDefault();
        g.brake();
        break;
      case 'KeyE':
        if (!e.repeat) g.dropCage();
        break;
      case 'KeyF':
        if (!e.repeat) this.action('haul');
        break;
      case 'KeyC':
        if (!e.repeat) g.collectByCrew();
        break;
      case 'KeyP':
        if (e.repeat) break;
        if (g.s.ship.docked) this.portOpen = !this.portOpen;
        else this.action('dock');
        break;
      case 'KeyR':
        if (!e.repeat) this.action('radar');
        break;
      case 'KeyM':
        if (!e.repeat) this.toggleMap();
        break;
      case 'KeyT':
        if (!e.repeat && g.s.stranded) g.callTow();
        break;
      case 'KeyG':
        if (!e.repeat) g.startChain();
        break;
      case 'KeyH':
        if (!e.repeat) g.returnToPortOrder();
        break;
      case 'KeyV':
        if (!e.repeat) this.voyageOpen = !this.voyageOpen;
        break;
      case 'Digit1':
        this.modes.set('taskbar');
        break;
      case 'Digit2':
        this.modes.set('small');
        break;
      case 'Digit3':
        this.modes.set('large');
        break;
      default:
        return false;
    }
    return true;
  }

  setTurn(v) {
    this.turn = v;
    this.game.helmInput = this.game.s.auto.active ? 0 : v;
  }

  // ---- events -------------------------------------------------------------
  handleEvent(e) {
    const s = this.game.s;
    switch (e.type) {
      case 'toast':
        this.pushToast(e.text, e.tone);
        break;
      case 'docked':
        if (!s.auto.active) this.portOpen = true;
        break;
      case 'sail':
        this.portOpen = false;
        break;
      default:
    }
  }

  pushToast(text, tone) {
    const wrap = this.$('.toasts');
    const el = wrap.ownerDocument.createElement('div');
    el.className = `toast ${tone || ''}`;
    el.textContent = text;
    wrap.appendChild(el);
    while (wrap.children.length > 5) wrap.firstChild.remove();
    setTimeout(() => el.remove(), 5200);
  }

  // ---- per-frame update -----------------------------------------------------
  update() {
    const g = this.game;
    const s = g.s;
    this.dash.update(g, this.view.yaw);
    const purse = `$${Math.round(s.money)}`;
    const purseEl = this.$('.purse');
    if (purseEl.textContent !== purse) purseEl.textContent = purse;
    this.setHtml('status', this.$('.status'), this.statusHtml());
    this.setHtml('hint', this.$('.hint'), this.hintText());
    this.setHtml('actions', this.$('[data-actions]'), this.actionsHtml());
    // Money changing must not throw the player back to the top of a long list.
    const portKey = this.portTab;
    const scroll = portKey === this.lastPortKey ? this.$('.port-body')?.scrollTop : 0;
    this.lastPortKey = portKey;
    this.setHtml('port', this.$('[data-port]'), this.portHtml());
    const body = this.$('.port-body');
    if (body && scroll !== undefined && body.scrollTop !== scroll) body.scrollTop = scroll;
    this.setHtml('dialog', this.$('[data-dialog]'), this.dialogHtml());
    this.view.portPanelOpen = s.ship.docked && this.portOpen && !this.paused;
    this.root.classList.toggle('port-open', this.view.portPanelOpen);
    this.$('[data-radar]').classList.toggle('on', s.radarOn);

    this.root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.modes.mode));
    this.root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === this.modes.preset));

    if (this.mapOpen && this.modes.mode !== 'large') this.toggleMap(false);
    this.mapPanel.update();
    this.minigame.frame();
    this.updateLabels();
    this.debug.update();
  }

  setHtml(key, el, html) {
    if (this.html[key] !== html) {
      this.html[key] = html;
      el.innerHTML = html;
    }
  }

  statusHtml() {
    const g = this.game;
    const s = g.s;
    const v = s.voyage;
    let text;
    if (s.towing) text = 'Under tow';
    else if (s.ship.docked) text = 'In port, Vardhamn';
    else if (s.ship.berthing) text = 'Coming alongside';
    else if (s.stranded) text = 'Out of fuel';
    else if (s.action?.type === 'drop') text = 'Dropping cage';
    else if (s.action?.type === 'collect') text = 'Crew hauling';
    else if (s.minigameCageId !== null) text = 'Hauling';
    else if (s.auto.active) text = s.auto.wait === 'soak' ? 'Autopilot, waiting on soak' : 'Autopilot';
    else text = 'At the helm';
    let time = '';
    if (v.deadline !== null && !v.expired) time = `<em>${fmtTime(v.deadline - s.t)} left</em>`;
    else if (v.snoozeUntil !== null) time = `<em>snoozed ${fmtTime(v.snoozeUntil - s.t)}</em>`;
    return `<span>${text}</span>${time}`;
  }

  // A gentle first-voyage guide that disappears after your first sale.
  hintText() {
    const g = this.game;
    const s = g.s;
    if (s.stats.earned > 0 || this.paused || (s.ship.docked && this.portOpen)) return '';
    if (s.ship.docked) return 'Press W to cast off.';
    if (s.ship.berthing) return 'Coming alongside. Shift gear to break off.';
    if (s.crabs > 0 && !s.cages.length) return 'Head back to the pier and press P to dock and sell your catch.';
    const near = g.nearestCage();
    if (near && g.cageInfo(near).ready) return 'Stop by the buoy and press F to haul the cage.';
    if (s.cages.length) return g.cagesAboard > 0 ? 'Cages soak for a while. Drop another, or wait nearby. The chart (M) shows their timers.' : 'Your cages are soaking. Check their timers on the chart (M).';
    const d = Math.hypot(s.ship.x - this.world.port.x, s.ship.z - this.world.port.z);
    if (d < CFG.minDropPortDistance) return 'Hold A or D to turn the wheel, then let go: it stays there. X centres it. W shifts up.';
    return 'Press R for radar, find warm water, slow to gear 1 with S, then press E to drop a cage.';
  }

  actionsHtml() {
    const g = this.game;
    const s = g.s;
    const btn = (ui, label, key = '', cls = '') => `<button class="btn ${cls}" data-ui="${ui}">${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    const out = [];
    if (s.ship.docked) {
      if (!this.portOpen) {
        out.push(btn('openPort', 'Harbour', 'P'));
        if (this.modes.mode === 'large') out.push(btn('openUpgrades', 'Upgrades'));
        out.push(btn('sail', 'Set sail', 'W', 'primary'));
      }
    } else if (!s.towing && !s.ship.berthing) {
      if (s.stranded) out.push(btn('tow', `Call tow $${g.towCost()}`, 'T', 'primary'));
      if (g.canDock) out.push(btn('dock', 'Dock', 'P', 'primary'));
      const near = g.nearestCage();
      if (near) {
        const ready = g.cageInfo(near).ready;
        out.push(btn('haul', ready ? 'Haul cage' : 'Haul early', 'F', ready ? 'primary' : ''));
        if (s.crew.deckhand) out.push(btn('crew', 'Crew haul', 'C'));
      } else if (g.cagesAboard > 0) {
        out.push(btn('drop', 'Drop cage', 'E'));
      }
      if (s.crew.captain && !s.auto.active) {
        if (s.auto.orders.length) out.push(btn('chain', 'Return to chain', 'G'));
        out.push(btn('home', 'Sail home', 'H'));
      }
    }
    return out.join('');
  }

  // ---- harbour --------------------------------------------------------------
  portHtml() {
    const g = this.game;
    const s = g.s;
    if (this.paused || !s.ship.docked || !this.portOpen || s.auto.active) return '';
    const large = this.modes.mode === 'large';
    const tab = large ? this.portTab : 'market';
    const tabLabel = { market: 'Market', crew: 'Crew', refit: 'Upgrades', yard: 'Boats' };
    const body = { market: () => this.marketHtml(large), crew: () => this.crewHtml(), refit: () => this.refitsHtml(), yard: () => this.shipsHtml() }[tab]();
    const v = s.voyage;
    return `
      <div class="port-side paper">
        <button class="close" data-ui="closePort" aria-label="Close">×</button>
        <header class="port-head">
          ${ORNAMENT}
          <h2>Vardhamn Harbour</h2>
          <div class="port-money">$${Math.round(s.money)}</div>
        </header>
        ${large ? `<nav class="tabs">${Object.keys(tabLabel).map((t) => `<button class="tab ${t === tab ? 'on' : ''}" data-tab="${t}">${tabLabel[t]}</button>`).join('')}</nav>` : ''}
        <div class="port-body">${body}</div>
        <footer class="port-foot">
          <label class="voyage-input">Break of <input data-voyage-input type="number" min="1" max="600" value="${v.minutes}" /> min</label>
          <button class="btn primary big" data-ui="sail">Set sail<kbd>W</kbd></button>
        </footer>
      </div>`;
  }

  marketHtml(large) {
    const g = this.game;
    const s = g.s;
    const sale = s.crabs * CFG.crabPrice;
    const pct = (a, b) => `<span class="mbar"><i style="width:${Math.min(100, (a / b) * 100).toFixed(0)}%"></i></span>`;
    const row = (key, name) => {
      const cost = g.refillCost(key);
      const price = key === 'fuel' ? CFG.fuelPrice : CFG.provisionPrice;
      return `<div class="market-row">
        <div class="m-main"><strong>${name}</strong><span class="sub">$${price} a unit · ${Math.round(s[key])} of ${key === 'fuel' ? g.maxFuel : g.maxProvisions}</span>${pct(s[key], key === 'fuel' ? g.maxFuel : g.maxProvisions)}</div>
        <div class="acts"><button class="btn" data-buy="${key}:10">+10</button><button class="btn" data-buy="${key}:fill" ${cost <= 0 ? 'disabled' : ''}>Fill $${cost}</button></div>
      </div>`;
    };
    return `
      <div class="market-row catch">
        <div class="m-main"><strong>King crab</strong><span class="sub">${Math.round(s.crabs)} in the tank, $${CFG.crabPrice} each</span>${pct(s.crabs, g.maxTank)}</div>
        <div class="acts"><button class="btn primary" data-ui="sell" ${s.crabs ? '' : 'disabled'}>Sell all $${sale}</button></div>
      </div>
      ${row('fuel', 'Marine diesel')}
      ${row('provisions', 'Provisions')}
      ${large ? '' : '<p class="sub small-note">Crew, upgrades and boats are in the full view. <button class="btn" data-mode="large">Open it</button></p>'}`;
  }

  crewHtml() {
    const s = this.game.s;
    const card = (role, stats) => {
      const info = CFG.crewInfo[role];
      const hired = s.crew[role];
      const cost = CFG.crewCost[role];
      return `<article class="card crew">
        <img class="portrait" src="${this.portraits.crew[role]}" alt="Portrait of ${info.name}" />
        <div class="card-body">
          <h3>${info.name}</h3>
          <div class="kind">${info.role}</div>
          <p>${info.blurb}</p>
          <dl class="stats">${stats.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
          <div class="card-act">${hired ? '<span class="aboard">Aboard</span>' : `<button class="btn primary" data-hire="${role}" ${s.money < cost ? 'disabled' : ''}>Hire $${cost}</button>`}</div>
        </div>
      </article>`;
    };
    return `
      ${card('deckhand', [['Haul yield', `${Math.round(CFG.deckhandEfficiency * 100)}%`], ['Wage', `$${CFG.wagePerMinute.deckhand} a minute at sea`], ['Handles', 'Drop and haul']])}
      ${card('captain', [['Fuel use', `-${Math.round((1 - CFG.autopilotFuelFactor) * 100)}% on autopilot`], ['Wage', `$${CFG.wagePerMinute.captain} a minute at sea`], ['Handles', 'Chart orders']])}`;
  }

  shipsHtml() {
    const g = this.game;
    const s = g.s;
    const all = Object.values(CFG.ships);
    const top = (k) => Math.max(...all.map((c) => c[k]));
    const topSpeed = CFG.gears.at(-1).speed;
    const stat = (label, value, frac) => `<div class="sbar"><span class="s-l">${label}</span><span class="s-b"><i style="width:${(frac * 100).toFixed(0)}%"></i></span><span class="s-v">${value}</span></div>`;
    return Object.entries(CFG.ships)
      .map(([id, c]) => {
        const owned = s.fleet.owned.includes(id);
        const current = s.fleet.current === id;
        let act;
        if (current) act = '<span class="aboard">Your boat</span>';
        else if (owned) act = `<button class="btn" data-board="${id}">Take the helm</button>`;
        else act = `<button class="btn primary" data-buyship="${id}" ${s.money < c.cost ? 'disabled' : ''}>Buy $${c.cost.toLocaleString('en-US')}</button>`;
        return `<article class="card ship ${current ? 'current' : ''}">
          <img class="shot" src="${this.portraits.ships[id]}" alt="The ${c.name}" />
          <div class="card-body">
            <h3>${c.name}</h3>
            <div class="kind">${c.kind} · ${c.model.length * 2.4 | 0} m</div>
            <p>${c.blurb}</p>
            <div class="sbars">
              ${stat('Top speed', `${(topSpeed * c.speed).toFixed(1)} kn`, c.speed / top('speed'))}
              ${stat('Handling', `${Math.round(c.turn * 100)}%`, c.turn / top('turn'))}
              ${stat('Economy', `${Math.round((1 / c.burn) * 100)}%`, 1 / c.burn / (1 / 0.85))}
              ${stat('Fuel', c.fuel, c.fuel / top('fuel'))}
              ${stat('Provisions', c.provisions, c.provisions / top('provisions'))}
              ${stat('Crab tank', c.tank, c.tank / top('tank'))}
              ${stat('Cages', c.cages, c.cages / top('cages'))}
              ${stat('Radar', `${c.radar} m`, c.radar / top('radar'))}
            </div>
            <div class="card-act">${act}</div>
          </div>
        </article>`;
      })
      .join('');
  }

  refitsHtml() {
    const g = this.game;
    const s = g.s;
    const rows = Object.keys(CFG.upgrades)
      .map((key) => {
        const u = CFG.upgrades[key];
        const lvl = s.levels[key];
        const cost = g.upgradeCost(key);
        const now = g.upgradeValue(key);
        const next = cost === null ? null : g.shipClass[key] + g.upgradeBonus(key, lvl + 1);
        let pips = '';
        for (let i = 0; i < u.cost.length; i++) pips += `<i class="${i < lvl ? 'in' : ''}"></i>`;
        return `<div class="refit">
          <div class="m-main">
            <div class="refit-top"><strong>${u.label}</strong><span class="pips">${pips}</span></div>
            <span class="sub val">${now} ${u.unit}${next !== null ? ` → <b>${next}</b>` : ''}</span>
          </div>
          <div class="acts">${cost === null ? '<span class="aboard">Maxed</span>' : `<button class="btn" data-upgrade="${key}" ${s.money < cost ? 'disabled' : ''}>$${cost}</button>`}</div>
        </div>`;
      })
      .join('');
    return `<div class="refits">${rows}</div><p class="sub note">Refits stay with you when you change boats.</p>`;
  }

  dialogHtml() {
    const g = this.game;
    const s = g.s;
    const v = s.voyage;
    if (this.paused) return '';
    if (this.voyageOpen) {
      return `<div class="dialog-wrap top-dialog"><div class="paper panel alarm">
        ${ORNAMENT}
        <h2>Voyage Plan</h2>
        <p>How long is your break? When the time runs out at sea, the weather turns.</p>
        <label class="voyage-input" style="justify-content:center"><input data-voyage-input type="number" min="1" max="600" value="${v.minutes}" /> minutes</label>
        <div class="acts"><button class="btn primary" data-ui="voyageSave">Set the clock</button><button class="btn" data-ui="voyageCancel">Cancel</button></div>
      </div></div>`;
    }
    if (this.confirmExit && s.auto.active) {
      return `<div class="dialog-wrap top-dialog"><div class="paper panel alarm">
        <h2>Take the helm?</h2>
        <p>Do you want to exit autopilot?</p>
        <div class="acts"><button class="btn primary" data-ui="exitAutoYes">Yes, I'll steer<kbd>Y</kbd></button><button class="btn" data-ui="exitAutoNo">Stay on chain<kbd>N</kbd></button></div>
      </div></div>`;
    }
    const portBell = v.expired && s.ship.docked;
    if (v.ringing || portBell) {
      const atPort = s.ship.docked;
      return `<div class="dialog-wrap top-dialog"><div class="paper panel alarm">
        ${ORNAMENT}
        <h2>${atPort ? 'The Bell Rings' : 'Time Is Up'}</h2>
        <p>${atPort ? 'Your voyage plan has run out. Safe in port.' : 'The horn is sounding and a storm is building.'}</p>
        <div class="acts">
          <button class="btn primary" data-ui="dismiss">Dismiss</button>
          ${atPort ? '' : `<button class="btn" data-ui="snooze">Snooze ${CFG.snoozeMinutes} min</button>`}
          <button class="btn" data-ui="changeTime">Change the time</button>
        </div>
      </div></div>`;
    }
    return '';
  }

  updateLabels() {
    const g = this.game;
    const s = g.s;
    const wrap = this.$('.labels');
    const seen = new Set();
    const skip = this.modes.mode === 'taskbar' || !this.settings.labels;
    const doc = wrap.ownerDocument;
    for (const c of s.cages) {
      seen.add(c.id);
      let el = this.cageEls.get(c.id);
      if (!el) {
        el = doc.createElement('div');
        el.className = 'cage-label';
        wrap.appendChild(el);
        this.cageEls.set(c.id, el);
      }
      if (skip) {
        el.style.display = 'none';
        continue;
      }
      const info = g.cageInfo(c);
      const p = this.view.project(c.x, 2.5, c.z);
      const d = Math.hypot(c.x - this.view.focus.x, c.z - this.view.focus.z);
      el.style.display = d > this.view.zoom * 3.4 ? 'none' : 'block';
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.classList.toggle('ready', info.ready && !info.late);
      el.classList.toggle('late', info.late);
      const text = fmtTime(info.age);
      if (el.textContent !== text) el.textContent = text;
    }
    for (const [id, el] of this.cageEls) {
      if (!seen.has(id)) {
        el.remove();
        this.cageEls.delete(id);
      }
    }
    // Waypoint marker: pinned to the screen edge when it is out of view.
    if (!this.wayEl) {
      this.wayEl = doc.createElement('div');
      this.wayEl.className = 'way-label';
      wrap.appendChild(this.wayEl);
    }
    if (s.waypoint && !skip && !this.paused) {
      const p = this.view.project(s.waypoint.x, 1, s.waypoint.z);
      const W = this.view.width;
      const H = this.view.height;
      const m = 34;
      const x = Math.max(m, Math.min(W - m, p.x));
      const y = Math.max(m, Math.min(H - 170, p.y));
      this.wayEl.style.display = 'block';
      this.wayEl.style.left = `${x}px`;
      this.wayEl.style.top = `${y}px`;
      const dist = `${Math.round(Math.hypot(s.waypoint.x - s.ship.x, s.waypoint.z - s.ship.z))} m`;
      if (this.wayEl.textContent !== dist) this.wayEl.textContent = dist;
    } else this.wayEl.style.display = 'none';
  }
}
