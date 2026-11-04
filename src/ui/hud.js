// Everything drawn in DOM over the game: gauges, actions, port, alarm and so on.
// Sections re-render only when their HTML changes, so buttons stay clickable.
import { CFG } from '../config.js';
import { fmtTime, MapPanel } from './map.js';
import { Minigame } from './minigame.js';
import { PRESETS } from './modes.js';

const ICONS = {
  taskbar: '<svg viewBox="0 0 18 14"><rect x="1" y="9" width="16" height="4" fill="currentColor"/><rect x="1" y="1" width="16" height="12" fill="none" stroke="currentColor"/></svg>',
  small: '<svg viewBox="0 0 18 14"><rect x="9" y="7" width="8" height="6" fill="currentColor"/><rect x="1" y="1" width="16" height="12" fill="none" stroke="currentColor"/></svg>',
  large: '<svg viewBox="0 0 18 14"><rect x="1" y="1" width="16" height="12" fill="currentColor"/></svg>',
};

const gaugeRow = (key, label) => `
  <div class="gauge" data-g="${key}">
    <span class="name">${label}</span><span class="bar"><span class="fill"></span></span><span class="num"></span>
  </div>`;

export class Hud {
  constructor({ root, game, world, view, audio, modes }) {
    this.root = root;
    this.game = game;
    this.world = world;
    this.view = view;
    this.audio = audio;
    this.modes = modes;
    this.portOpen = game.s.ship.docked;
    this.mapOpen = false;
    this.voyageOpen = false;
    this.confirmExit = false;
    this.showTitle = true;
    this.muted = false;
    this.portTab = 'trade';
    this.cageEls = new Map();
    this.html = {};

    root.innerHTML = `
      <div class="gauges">
        <div class="purse"></div>
        ${gaugeRow('fuel', 'Fuel')}
        ${gaugeRow('provisions', 'Rations')}
        ${gaugeRow('tank', 'Tank')}
        <div class="cage-count"></div>
      </div>
      <div class="banner"></div>
      <div class="modes">
        <div class="presets">${Object.keys(PRESETS).map((k) => `<button class="btn" data-preset="${k}">${k}</button>`).join('')}</div>
        <button class="btn" data-ui="mute" title="Sound" data-mute>♪</button>
        <button class="btn" data-mode="taskbar" title="Taskbar strip">${ICONS.taskbar}</button>
        <button class="btn" data-mode="small" title="Small window">${ICONS.small}</button>
        <button class="btn" data-mode="large" title="Large window">${ICONS.large}</button>
      </div>
      <div class="labels"></div>
      <div class="controls">
        <div class="gearbox"></div>
        <div class="row" data-actions></div>
      </div>
      <div class="toasts"></div>
      <div data-port class="hud-panel"></div>
      <div data-map class="hud-panel"></div>
      <div data-minigame class="hud-panel"></div>
      <div data-dialog class="hud-panel"></div>
      <div data-title></div>`;

    this.$ = (sel) => root.querySelector(sel);
    this.mapPanel = new MapPanel({ game, world, audio });
    this.minigame = new Minigame({ container: this.$('[data-minigame]'), game, audio, onClose: () => {} });

    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    this.root.classList.add('on-title');
    this.renderTitle();
  }

  setHtml(key, el, html) {
    if (this.html[key] !== html) {
      this.html[key] = html;
      el.innerHTML = html;
    }
  }

  // ---- title --------------------------------------------------------------
  renderTitle() {
    const g = this.game;
    const fresh = g.s.t < 1;
    this.$('[data-title]').innerHTML = `
      <div class="title">
        <h1>DECK · STOP</h1>
        <p>Crabbing the Arctic, one coffee break at a time</p>
        <div class="acts">
          <button class="btn primary" data-ui="begin">${fresh ? 'Begin' : 'Continue'}</button>
          ${fresh ? '' : '<button class="btn" data-ui="newGame">New voyage</button>'}
        </div>
        <div class="keys">
          W / S shift gear · A / D steer · Space brake · E drop cage · F haul cage<br />
          R radar · M chart · P port · right-drag to turn the camera · wheel to zoom
        </div>
      </div>`;
  }

  // ---- input ---------------------------------------------------------------
  onChange(e) {
    if (e.target.matches('[data-voyage-input]')) {
      const v = parseFloat(e.target.value);
      if (v > 0) this.pendingVoyage = v;
    }
  }

  onClick(e) {
    const t = e.target.closest('[data-ui],[data-mode],[data-preset],[data-remove],[data-upgrade],[data-hire],[data-buy],[data-tab]');
    if (!t) return;
    this.audio.unlock();
    this.audio.click();
    const g = this.game;
    if (t.dataset.mode) {
      this.modes.set(t.dataset.mode);
      return;
    }
    if (t.dataset.preset) {
      this.modes.setPreset(t.dataset.preset);
      return;
    }
    if (t.dataset.remove !== undefined) {
      g.removeOrder(Number(t.dataset.remove));
      return;
    }
    if (t.dataset.upgrade) {
      g.upgrade(t.dataset.upgrade);
      return;
    }
    if (t.dataset.hire) {
      g.hire(t.dataset.hire);
      return;
    }
    if (t.dataset.tab) {
      this.portTab = t.dataset.tab;
      return;
    }
    if (t.dataset.buy) {
      const [key, amt] = t.dataset.buy.split(':');
      g.buy(key, amt === 'fill' ? Infinity : Number(amt));
      return;
    }
    this.action(t.dataset.ui);
  }

  action(name) {
    const g = this.game;
    const s = g.s;
    switch (name) {
      case 'begin':
        this.$('[data-title]').innerHTML = '';
        this.root.classList.remove('on-title');
        this.showTitle = false;
        break;
      case 'newGame':
        this.onNewGame?.();
        break;
      case 'mute':
        this.muted = !this.muted;
        this.audio.setMuted(this.muted);
        this.$('[data-mute]').classList.toggle('on', this.muted);
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
        if (g.canDock) g.dock();
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
    if (v > 0) {
      this.game.setVoyage(v);
    }
    this.pendingVoyage = null;
  }

  toggleMap(state = !this.mapOpen) {
    if (this.modes.mode !== 'large') return;
    this.mapOpen = state;
    if (state) this.mapPanel.mount(this.$('[data-map]'));
    else this.mapPanel.unmount();
  }

  onKey(e, down) {
    if (e.target?.tagName === 'INPUT') return false;
    const g = this.game;
    const k = e.code;
    if (!down) {
      if ((k === 'KeyA' && this.turn === 1) || (k === 'KeyD' && this.turn === -1)) this.setTurn(0);
      return false;
    }
    if (this.showTitle) return false;
    this.audio.unlock();
    if (this.minigame.active) {
      if (k === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.minigame.press();
      } else if (k === 'Escape') this.minigame.cancel();
      return true;
    }
    if (k === 'Escape') {
      this.toggleMap(false);
      this.confirmExit = false;
      this.voyageOpen = false;
      if (g.s.ship.docked) this.portOpen = false;
      return true;
    }
    const steering = ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(k);
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
        else g.shiftGear(1);
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
    if (!this.game.s.auto.active) this.game.turnInput = v;
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
    const el = document.createElement('div');
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
    this.$('.purse').textContent = `$${Math.round(s.money)}`;
    this.gauge('fuel', s.fuel, g.maxFuel, true);
    this.gauge('provisions', s.provisions, g.maxProvisions, true);
    this.gauge('tank', s.crabs, g.maxTank, false);
    this.$('.cage-count').textContent = `${g.cagesAboard} of ${g.maxCages} cages aboard`;

    this.setHtml('banner', this.$('.banner'), this.bannerHtml());
    this.setHtml('gear', this.$('.gearbox'), this.gearHtml());
    this.setHtml('actions', this.$('[data-actions]'), this.actionsHtml());
    this.setHtml('port', this.$('[data-port]'), this.portHtml());
    this.setHtml('dialog', this.$('[data-dialog]'), this.dialogHtml());

    this.root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.modes.mode));
    this.root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === this.modes.preset));

    if (this.mapOpen && this.modes.mode !== 'large') this.toggleMap(false);
    this.mapPanel.update();
    this.minigame.frame();
    this.updateLabels();
  }

  gauge(key, val, max, lowIsBad) {
    const el = this.$(`[data-g="${key}"]`);
    const f = Math.max(0, val / max);
    el.querySelector('.fill').style.width = `${Math.min(100, f * 100)}%`;
    el.querySelector('.num').textContent = `${Math.round(val)}/${max}`;
    el.classList.toggle('low', lowIsBad ? f < CFG.lowResource : f >= 1);
  }

  bannerHtml() {
    const g = this.game;
    const s = g.s;
    const v = s.voyage;
    let text;
    if (s.towing) text = 'Under tow';
    else if (s.ship.docked) text = 'In port';
    else if (s.stranded) text = 'Out of fuel';
    else if (s.action?.type === 'drop') text = 'Dropping cage';
    else if (s.action?.type === 'collect') text = 'Crew hauling';
    else if (s.minigameCageId !== null) text = 'Hauling';
    else if (s.auto.active) text = s.auto.wait === 'soak' ? 'Autopilot, waiting on soak' : 'Autopilot';
    else text = 'At the helm';
    let time = '';
    if (v.deadline !== null && !v.expired) time = `<small>${fmtTime(v.deadline - s.t)} left</small>`;
    else if (v.snoozeUntil !== null) time = `<small>snoozed ${fmtTime(v.snoozeUntil - s.t)}</small>`;
    return `${text}${time}`;
  }

  gearHtml() {
    const g = this.game;
    const s = g.s;
    const items = CFG.gears
      .map((gear, i) => {
        const id = i - CFG.gearOffset;
        const label = id === -1 ? 'R' : id === 0 ? 'N' : String(id);
        return `<span class="${id === s.ship.gear ? 'on' : ''} ${id >= 3 ? 'dear' : ''}">${label}</span>`;
      })
      .join('');
    return `${items}<em>${g.gear.name} · ${Math.abs(s.ship.speed).toFixed(1)} kn</em>`;
  }

  actionsHtml() {
    const g = this.game;
    const s = g.s;
    const btn = (ui, label, key = '', cls = '') => `<button class="btn ${cls}" data-ui="${ui}">${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    const out = [];
    if (s.ship.docked) {
      if (!this.portOpen) {
        out.push(btn('openPort', 'Port', 'P'));
        out.push(btn('sail', 'Set sail', 'W', 'primary'));
      }
    } else if (!s.towing) {
      if (s.stranded) out.push(btn('tow', `Call tow $${g.towCost()}`, 'T', 'primary'));
      if (g.canDock) out.push(btn('dock', 'Dock', 'P', 'primary'));
      const near = g.nearestCage();
      if (near) {
        const label = s.t - near.t0 >= CFG.soakPeak ? 'Haul cage' : 'Haul early';
        out.push(btn('haul', label, 'F', s.t - near.t0 >= CFG.soakPeak ? 'primary' : ''));
        if (s.crew.deckhand) out.push(btn('crew', 'Crew haul', 'C'));
      } else if (g.cagesAboard > 0) {
        out.push(btn('drop', 'Drop cage', 'E'));
      }
      if (s.crew.captain && !s.auto.active) {
        if (s.auto.orders.length) out.push(btn('chain', 'Return to chain', 'G'));
        out.push(btn('home', 'Sail home', 'H'));
      }
    }
    out.push(btn('radar', 'Radar', 'R', s.radarOn ? 'on' : ''));
    out.push(`<button class="btn large-only" data-ui="map">Chart<kbd>M</kbd></button>`);
    out.push(btn('voyage', 'Voyage', 'V'));
    return out.join('');
  }

  portHtml() {
    const g = this.game;
    const s = g.s;
    if (this.showTitle || !s.ship.docked || !this.portOpen || s.auto.active) return '';
    const large = this.modes.mode === 'large';
    const tab = large ? this.portTab : 'trade';
    const tabs = ['trade', 'jobs', 'shipyard'];
    const tabLabel = { trade: 'Market', jobs: 'Job board', shipyard: 'Shipyard' };

    let body = '';
    if (tab === 'trade') {
      const sale = s.crabs * CFG.crabPrice;
      body = `
        <div class="tr"><div>King crab<div class="sub">${Math.round(s.crabs)} in the tank, $${CFG.crabPrice} each</div></div>
          <div class="acts"><button class="btn primary" data-ui="sell" ${s.crabs ? '' : 'disabled'}>Sell all $${sale}</button></div></div>
        <div class="tr"><div>Fuel ${Math.round(s.fuel)}/${g.maxFuel}<div class="sub">$${CFG.fuelPrice} a unit</div></div>
          <div class="acts"><button class="btn" data-buy="fuel:10">+10</button><button class="btn" data-buy="fuel:fill">Fill $${g.refillCost('fuel')}</button></div></div>
        <div class="tr"><div>Rations ${Math.round(s.provisions)}/${g.maxProvisions}<div class="sub">$${CFG.provisionPrice} a unit</div></div>
          <div class="acts"><button class="btn" data-buy="provisions:10">+10</button><button class="btn" data-buy="provisions:fill">Fill $${g.refillCost('provisions')}</button></div></div>`;
      if (!large) body += '<div class="tr"><div class="sub" style="display:block">Job board and shipyard open in the large window.</div></div>';
    } else if (tab === 'jobs') {
      const row = (role, name, desc) => {
        const hired = s.crew[role];
        return `<div class="tr"><div>${name}<div class="sub">${desc}</div></div>
          <div class="acts">${hired ? '<span class="sub" style="display:inline">Aboard</span>' : `<button class="btn" data-hire="${role}" ${s.money < CFG.crewCost[role] ? 'disabled' : ''}>Hire $${CFG.crewCost[role]}</button>`}</div></div>`;
      };
      body = `
        ${row('deckhand', 'Deckhand', `Drops and hauls cages without the minigame, at ${Math.round(CFG.deckhandEfficiency * 100)}% yield. Small wage.`)}
        ${row('captain', 'Captain', 'Sails your chart orders on autopilot in the economical gear. Small wage.')}`;
    } else {
      body = `<div class="columns">${Object.keys(CFG.upgrades)
        .map((key) => {
          const u = CFG.upgrades[key];
          const lvl = s.levels[key];
          const cost = g.upgradeCost(key);
          const pips = '●'.repeat(lvl) + '○'.repeat(u.cost.length - lvl);
          return `<div class="tr"><div>${u.label}<span class="pips">${pips}</span><div class="sub">${u.values[lvl]} ${u.unit}${cost !== null ? ` → ${u.values[lvl + 1]}` : ''}</div></div>
            <div class="acts">${cost === null ? '<span class="sub" style="display:inline">Max</span>' : `<button class="btn" data-upgrade="${key}" ${s.money < cost ? 'disabled' : ''}>$${cost}</button>`}</div></div>`;
        })
        .join('')}</div>`;
    }

    const v = s.voyage;
    return `
      <div class="dialog-wrap">
        <div class="paper panel">
          <button class="close" data-ui="closePort" aria-label="Close">×</button>
          <h2>Harbour · $${Math.round(s.money)}</h2>
          ${large ? `<div class="tools" style="justify-content:center">${tabs.map((t) => `<button class="btn ${t === tab ? 'on' : ''}" data-tab="${t}">${tabLabel[t]}</button>`).join('')}</div>` : ''}
          ${body}
          <div class="footer">
            <label class="voyage-input">Voyage plan <input data-voyage-input type="number" min="1" max="600" value="${v.minutes}" /> min</label>
            <button class="btn primary" data-ui="sail">Set sail</button>
          </div>
        </div>
      </div>`;
  }

  dialogHtml() {
    const g = this.game;
    const s = g.s;
    const v = s.voyage;
    if (this.showTitle) return '';
    if (this.voyageOpen) {
      return `<div class="dialog-wrap top-dialog"><div class="paper panel alarm">
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
    const skip = this.modes.mode === 'taskbar';
    for (const c of s.cages) {
      seen.add(c.id);
      let el = this.cageEls.get(c.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'cage-label';
        wrap.appendChild(el);
        this.cageEls.set(c.id, el);
      }
      if (skip) continue;
      const age = s.t - c.t0;
      const p = this.view.project(c.x, 2.5, c.z);
      const d = Math.hypot(c.x - this.view.focus.x, c.z - this.view.focus.z);
      const inMist = d > this.view.zoom * 2.6;
      el.style.display = inMist ? 'none' : 'block';
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      const ready = age >= CFG.soakPeak;
      const late = age > CFG.soakPeak + 20;
      el.classList.toggle('ready', ready && !late);
      el.classList.toggle('late', late);
      const text = fmtTime(age);
      if (el.textContent !== text) el.textContent = text;
    }
    for (const [id, el] of this.cageEls) {
      if (!seen.has(id)) {
        el.remove();
        this.cageEls.delete(id);
      }
    }
  }
}
