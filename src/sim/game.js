// The whole game rules layer. It knows nothing about rendering or the DOM, so it
// keeps running when the tab is hidden and can be exercised from plain Node tests.
import { CFG } from '../config.js';
import { createNav } from './nav.js';

export const STEP = 1 / 20;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v, target, rate) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));

export function cageYield(cage, now) {
  const age = now - cage.t0;
  const cap = CFG.cageCapMin + CFG.cageCapDensity * cage.density;
  if (age <= CFG.soakPeak) {
    const t = clamp(age / CFG.soakPeak, 0, 1);
    return cap * t * t * (3 - 2 * t);
  }
  const over = clamp((age - CFG.soakPeak) / CFG.escapeTime, 0, 1);
  return cap * (1 - over * (1 - CFG.escapeFloor));
}

export function newState(world) {
  const up = CFG.upgrades;
  return {
    v: 1,
    seed: world.seed,
    t: 0,
    money: CFG.start.money,
    ship: {
      x: world.port.x,
      z: world.port.z,
      heading: world.port.heading,
      speed: 0,
      gear: 0,
      rudder: 0,
      docked: true,
    },
    fuel: up.fuel.values[0],
    provisions: up.provisions.values[0],
    crabs: 0,
    wagesOwed: 0,
    levels: { fuel: 0, provisions: 0, tank: 0, cages: 0, radar: 0 },
    crew: { captain: false, deckhand: false },
    cages: [],
    nextCageId: 1,
    radarOn: false,
    towing: false,
    stranded: false,
    action: null,
    minigameCageId: null,
    auto: { active: false, orders: [], idx: 0, loop: false, wait: null },
    voyage: { deadline: null, minutes: CFG.start.voyageMinutes, ringing: false, expired: false, snoozeUntil: null },
    weather: { storm: 0, overcast: 0, overcastUntil: 0 },
    stats: { crabsLanded: 0, earned: 0, cagesPulled: 0 },
  };
}

export class Game {
  constructor(world, state = null) {
    this.world = world;
    this.nav = createNav(world);
    this.s = state ?? newState(world);
    this.events = [];
    this.acc = 0;
    this.turnInput = 0;
    this.path = null;
    this.pathKey = null;
    this.prev = { x: this.s.ship.x, z: this.s.ship.z, heading: this.s.ship.heading };
    this.warned = { fuel: false, provisions: false, tank: false };
    this.lastAground = -10;
    this.lastReadyNote = -10;
    this.alpha = 0;
  }

  // ---- derived values -------------------------------------------------------
  upgradeValue(key) {
    return CFG.upgrades[key].values[this.s.levels[key]];
  }
  get maxFuel() {
    return this.upgradeValue('fuel');
  }
  get maxProvisions() {
    return this.upgradeValue('provisions');
  }
  get maxTank() {
    return this.upgradeValue('tank');
  }
  get maxCages() {
    return this.upgradeValue('cages');
  }
  get radarRange() {
    return this.upgradeValue('radar');
  }
  get cagesAboard() {
    return this.maxCages - this.s.cages.length;
  }
  get tankFree() {
    return Math.max(0, this.maxTank - this.s.crabs);
  }
  get gear() {
    return CFG.gears[this.s.ship.gear + CFG.gearOffset];
  }
  get atSea() {
    return !this.s.ship.docked;
  }
  get canDock() {
    const { ship, towing } = this.s;
    if (ship.docked || towing) return false;
    return Math.hypot(ship.x - this.world.port.x, ship.z - this.world.port.z) < CFG.dockReach;
  }
  get provisionsOut() {
    return this.s.provisions <= 0;
  }
  get crewEfficiency() {
    return CFG.deckhandEfficiency * (this.provisionsOut ? CFG.noProvisionEfficiency : 1);
  }

  nearestCage(range = CFG.cageReach) {
    const { ship, cages } = this.s;
    let best = null;
    let bestD = range;
    for (const c of cages) {
      const d = Math.hypot(c.x - ship.x, c.z - ship.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  emit(type, data = {}) {
    this.events.push({ type, t: this.s.t, ...data });
  }
  toast(text, tone = 'info') {
    this.emit('toast', { text, tone });
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---- frame stepping -------------------------------------------------------
  advance(realDt) {
    this.acc += Math.min(realDt, 5);
    while (this.acc >= STEP) {
      this.prev = { x: this.s.ship.x, z: this.s.ship.z, heading: this.s.ship.heading };
      this.step(STEP);
      this.acc -= STEP;
    }
    this.alpha = this.acc / STEP;
  }

  step(dt) {
    const s = this.s;
    s.t += dt;
    this.stepWeather(dt);
    this.stepVoyage();
    this.stepCages();
    this.stepAction();
    if (s.towing) this.stepTow(dt);
    else if (s.ship.docked) this.stepDocked(dt);
    else {
      if (s.auto.active) this.stepAutopilot(dt);
      this.stepShip(dt);
    }
    this.stepResources(dt);
  }

  stepDocked(dt) {
    const { ship } = this.s;
    const { port } = this.world;
    const k = 1 - Math.exp(-dt * 2.5);
    ship.x += (port.x - ship.x) * k;
    ship.z += (port.z - ship.z) * k;
    ship.heading += wrapAngle(port.heading - ship.heading) * k;
    ship.speed = 0;
    ship.gear = 0;
    if (this.s.auto.active) this.stepAutopilotDocked();
  }

  stepShip(dt) {
    const s = this.s;
    const ship = s.ship;
    const storm = s.weather.storm;
    const busy = s.minigameCageId !== null;

    let target = this.gear.speed;
    if (this.provisionsOut) target *= CFG.noProvisionSpeed;
    target *= 1 - 0.25 * storm;
    if (s.fuel <= 0 || busy) target = 0;

    const braking = ship.gear === 0 || Math.abs(target) < Math.abs(ship.speed);
    ship.speed = approach(ship.speed, target, (braking ? CFG.brake : CFG.accel) * dt);

    ship.rudder = approach(ship.rudder, busy ? 0 : this.turnInput, 3.2 * dt);
    const authority = 0.35 + 0.65 * Math.min(1, Math.abs(ship.speed) / 4);
    const direction = ship.speed < -0.05 ? -1 : 1;
    ship.heading += ship.rudder * CFG.turnRate * authority * direction * dt;

    // Storm: yaw and sideways shove make the ship harder to hold on course.
    let driftX = 0;
    let driftZ = 0;
    if (storm > 0.01) {
      ship.heading += Math.sin(s.t * 0.9) * Math.sin(s.t * 0.37 + 1.3) * 0.5 * storm * dt;
      driftX = Math.sin(s.t * 0.21) * 1.6 * storm;
      driftZ = Math.cos(s.t * 0.17 + 2) * 1.6 * storm;
    }

    const nx = ship.x + (Math.sin(ship.heading) * ship.speed + driftX) * dt;
    const nz = ship.z + (Math.cos(ship.heading) * ship.speed + driftZ) * dt;
    const here = this.world.shoreDistance(ship.x, ship.z);
    const there = this.world.shoreDistance(nx, nz);
    if (there < 2 && there < here) {
      if (s.t - this.lastAground > 3 && Math.abs(ship.speed) > 1) {
        this.emit('aground');
        this.toast('Too close to the rocks. Shift astern with S.', 'warn');
        this.lastAground = s.t;
      }
      ship.speed = -ship.speed * 0.15;
      ship.gear = 0;
    } else {
      const lim = this.world.half - 6;
      ship.x = clamp(nx, -lim, lim);
      ship.z = clamp(nz, -lim, lim);
    }

    if (Math.abs(ship.speed) > 0.05) {
      const fuelRate = this.gear.fuel * (s.auto.active ? CFG.autopilotFuelFactor : 1);
      s.fuel = Math.max(0, s.fuel - fuelRate * dt);
      if (s.fuel <= 0 && !s.stranded) this.onStranded();
    }
  }

  stepResources(dt) {
    const s = this.s;
    if (!s.ship.docked) {
      s.provisions = Math.max(0, s.provisions - CFG.provisionRate * dt);
      const crew = CFG.wagePerMinute;
      const perMin = (s.crew.captain ? crew.captain : 0) + (s.crew.deckhand ? crew.deckhand : 0);
      s.wagesOwed += (perMin / 60) * dt;
    }
    this.warnLow('fuel', s.fuel / this.maxFuel < CFG.lowResource, 'Fuel running low');
    this.warnLow('provisions', s.provisions / this.maxProvisions < CFG.lowResource, 'Provisions running low');
    this.warnLow('tank', s.crabs >= this.maxTank, 'Crab tank is full');
  }

  warnLow(key, low, text) {
    if (low && !this.warned[key]) {
      this.warned[key] = true;
      this.emit('low', { key });
      this.toast(text, 'warn');
    } else if (!low) this.warned[key] = false;
  }

  onStranded() {
    const s = this.s;
    s.stranded = true;
    s.ship.gear = 0;
    this.emit('stranded');
    if (s.auto.active && s.crew.captain) {
      this.toast('Out of fuel. The captain radioed for a tow.', 'warn');
      this.callTow();
    } else this.toast('Out of fuel. Call a tow ship.', 'warn');
  }

  towCost() {
    const { ship } = this.s;
    const d = Math.hypot(ship.x - this.world.port.x, ship.z - this.world.port.z);
    return Math.round(CFG.towBase + d * CFG.towPerUnit);
  }

  callTow() {
    const s = this.s;
    if (s.towing || s.ship.docked) return false;
    const cost = this.towCost();
    s.money -= cost;
    s.towing = true;
    s.ship.gear = 0;
    this.path = null;
    this.emit('tow', { cost });
    this.toast(`Tow ship on its way: -$${cost}`, 'warn');
    return true;
  }

  stepTow(dt) {
    const s = this.s;
    const { ship } = s;
    const { port } = this.world;
    if (!this.path) this.path = this.nav.findPath(ship.x, ship.z, port.x, port.z);
    const wp = this.path[0];
    const d = Math.hypot(wp.x - ship.x, wp.z - ship.z);
    const dist = CFG.towSpeed * dt;
    ship.heading += wrapAngle(Math.atan2(wp.x - ship.x, wp.z - ship.z) - ship.heading) * (1 - Math.exp(-dt * 2));
    ship.speed = CFG.towSpeed;
    if (d <= dist) {
      ship.x = wp.x;
      ship.z = wp.z;
      this.path.shift();
      if (!this.path.length) {
        this.path = null;
        s.towing = false;
        this.dock();
      }
    } else {
      ship.x += ((wp.x - ship.x) / d) * dist;
      ship.z += ((wp.z - ship.z) / d) * dist;
    }
  }

  // ---- cages ----------------------------------------------------------------
  stepCages() {
    const s = this.s;
    for (const c of s.cages) {
      if (!c.ready && s.t - c.t0 >= CFG.soakPeak) {
        c.ready = true;
        if (s.t - this.lastReadyNote > 4) {
          const n = s.cages.filter((k) => s.t - k.t0 >= CFG.soakPeak).length;
          this.emit('cageReady', { x: c.x, z: c.z });
          this.toast(n > 1 ? `${n} cages ready` : 'Cage ready', 'good');
          this.lastReadyNote = s.t;
        }
      }
    }
  }

  stepAction() {
    const a = this.s.action;
    if (!a) return;
    a.left -= STEP;
    if (a.left > 0) return;
    this.s.action = null;
    if (a.type === 'drop') this.placeCage();
    else if (a.type === 'collect') {
      const cage = this.s.cages.find((c) => c.id === a.cageId);
      if (cage) this.landCage(cage, this.crewEfficiency, true);
    }
  }

  dropBlockReason() {
    const s = this.s;
    if (s.ship.docked) return 'You cannot drop cages in port.';
    if (s.action || s.minigameCageId !== null) return 'The deck is busy.';
    if (this.cagesAboard <= 0) return 'No cages left aboard.';
    if (Math.abs(s.ship.speed) > 3.6) return 'Too fast: slow to gear 1 to drop.';
    if (this.world.shoreDistance(s.ship.x, s.ship.z) < CFG.minDropShoreDistance) return 'Too shallow here.';
    const crowded = s.cages.some((c) => Math.hypot(c.x - s.ship.x, c.z - s.ship.z) < CFG.minCageSpacing);
    if (crowded) return 'Another cage is too close.';
    return null;
  }

  dropCage() {
    const reason = this.dropBlockReason();
    if (reason) {
      this.toast(reason, 'warn');
      return false;
    }
    this.s.action = { type: 'drop', left: CFG.dropDuration, dur: CFG.dropDuration };
    return true;
  }

  placeCage() {
    const s = this.s;
    const { ship } = s;
    const cx = ship.x - Math.sin(ship.heading) * 4;
    const cz = ship.z - Math.cos(ship.heading) * 4;
    const density = this.world.density(cx, cz);
    s.cages.push({ id: s.nextCageId++, x: cx, z: cz, t0: s.t, density, ready: false });
    this.emit('cageDropped', { x: cx, z: cz });
  }

  collectBlockReason(cage) {
    const s = this.s;
    if (!cage) return 'No cage in reach.';
    if (s.action || s.minigameCageId !== null) return 'The deck is busy.';
    if (this.tankFree <= 0) return 'The crab tank is full.';
    return null;
  }

  // Player hauls by hand: the UI runs the minigame, then calls finishMinigame.
  startMinigame() {
    const cage = this.nearestCage();
    const reason = this.collectBlockReason(cage);
    if (reason) {
      this.toast(reason, 'warn');
      return false;
    }
    this.s.ship.gear = 0;
    this.s.minigameCageId = cage.id;
    this.emit('minigameStart', { cageId: cage.id });
    return true;
  }

  finishMinigame(quality) {
    const s = this.s;
    const cage = s.cages.find((c) => c.id === s.minigameCageId);
    s.minigameCageId = null;
    if (!cage) return null;
    const q = clamp(quality, 0, 1);
    const mult = CFG.minigameMin + (CFG.minigameMax - CFG.minigameMin) * q;
    return this.landCage(cage, mult * (this.provisionsOut ? CFG.noProvisionEfficiency : 1), false);
  }

  cancelMinigame() {
    this.s.minigameCageId = null;
  }

  collectByCrew() {
    const s = this.s;
    if (!s.crew.deckhand) {
      this.toast('Hire a deckhand at the job board first.', 'warn');
      return false;
    }
    const cage = this.nearestCage();
    const reason = this.collectBlockReason(cage);
    if (reason) {
      this.toast(reason, 'warn');
      return false;
    }
    s.ship.gear = 0;
    s.action = { type: 'collect', cageId: cage.id, left: CFG.crewCollectDuration, dur: CFG.crewCollectDuration };
    return true;
  }

  landCage(cage, multiplier, byCrew) {
    const s = this.s;
    const caught = Math.round(cageYield(cage, s.t) * multiplier);
    const taken = Math.min(caught, this.tankFree);
    s.crabs += taken;
    s.cages = s.cages.filter((c) => c.id !== cage.id);
    s.stats.cagesPulled += 1;
    s.stats.crabsLanded += taken;
    this.emit('cageCollected', { x: cage.x, z: cage.z, crabs: taken, byCrew });
    const spill = caught - taken;
    this.toast(spill > 0 ? `+${taken} crabs. Tank full: ${spill} back to sea.` : `+${taken} crabs`, 'good');
    return taken;
  }

  // ---- manual controls ------------------------------------------------------
  shiftGear(delta) {
    const { ship } = this.s;
    if (ship.docked || this.s.towing) return;
    ship.gear = clamp(ship.gear + delta, -1, CFG.gears.length - 1 - CFG.gearOffset);
  }

  brake() {
    if (this.s.ship.docked || this.s.towing) return;
    this.s.ship.gear = 0;
  }

  exitAutopilot() {
    this.s.auto.active = false;
    this.s.auto.wait = null;
    this.path = null;
    this.s.ship.gear = 0;
    this.emit('autopilot', { active: false });
  }

  // ---- port -----------------------------------------------------------------
  dock() {
    const s = this.s;
    s.ship.docked = true;
    s.ship.gear = 0;
    s.ship.speed = 0;
    s.stranded = false;
    if (s.wagesOwed >= 1) {
      const pay = Math.round(s.wagesOwed);
      s.money -= pay;
      s.wagesOwed -= pay;
      this.toast(`Crew wages paid: -$${pay}`);
    }
    s.voyage.ringing = false;
    s.voyage.snoozeUntil = null;
    this.emit('docked');
  }

  setSail() {
    const s = this.s;
    if (!s.ship.docked) return false;
    if (s.fuel <= 0) {
      this.toast('The fuel tank is empty.', 'warn');
      return false;
    }
    s.ship.docked = false;
    s.ship.gear = s.auto.active ? 0 : 1;
    this.emit('sail');
    if (s.voyage.expired) this.ring();
    return true;
  }

  sellCrabs(count = this.s.crabs) {
    const s = this.s;
    if (!s.ship.docked) return 0;
    const n = Math.min(count, s.crabs);
    if (n <= 0) return 0;
    const income = n * CFG.crabPrice;
    s.crabs -= n;
    s.money += income;
    s.stats.earned += income;
    this.emit('sold', { crabs: n, income });
    return income;
  }

  // Buying is allowed into a small debt so a broke player can always leave port.
  buy(key, amount) {
    const s = this.s;
    if (!s.ship.docked) return 0;
    const price = key === 'fuel' ? CFG.fuelPrice : CFG.provisionPrice;
    const cap = key === 'fuel' ? this.maxFuel : this.maxProvisions;
    const room = cap - s[key];
    const affordable = Math.max(0, (s.money - CFG.debtFloor) / price);
    const n = Math.min(amount, room, affordable);
    if (n <= 0) return 0;
    s[key] += n;
    s.money -= n * price;
    if (s[key] > 0) s.stranded = false;
    return n;
  }

  refillCost(key) {
    const s = this.s;
    const cap = key === 'fuel' ? this.maxFuel : this.maxProvisions;
    const price = key === 'fuel' ? CFG.fuelPrice : CFG.provisionPrice;
    return Math.ceil((cap - s[key]) * price);
  }

  hire(role) {
    const s = this.s;
    const cost = CFG.crewCost[role];
    if (!s.ship.docked || s.crew[role] || s.money < cost) return false;
    s.money -= cost;
    s.crew[role] = true;
    this.emit('hired', { role });
    return true;
  }

  upgradeCost(key) {
    const u = CFG.upgrades[key];
    const lvl = this.s.levels[key];
    return lvl < u.cost.length ? u.cost[lvl] : null;
  }

  upgrade(key) {
    const s = this.s;
    const cost = this.upgradeCost(key);
    if (!s.ship.docked || cost === null || s.money < cost) return false;
    s.money -= cost;
    s.levels[key] += 1;
    if (key === 'fuel' || key === 'provisions') s[key] = s[key]; // capacity grows; contents stay
    this.emit('upgraded', { key });
    return true;
  }

  // ---- autopilot and chained orders ----------------------------------------
  addOrder(order) {
    this.s.auto.orders.push(order);
  }
  clearOrders() {
    const a = this.s.auto;
    a.orders = [];
    a.idx = 0;
    a.active = false;
    a.wait = null;
    this.path = null;
  }
  removeOrder(i) {
    const a = this.s.auto;
    a.orders.splice(i, 1);
    if (a.idx > i) a.idx -= 1;
    if (a.idx >= a.orders.length) a.idx = 0;
    this.path = null;
  }

  startChain() {
    const s = this.s;
    if (!s.crew.captain) {
      this.toast('Hire a captain to use the autopilot.', 'warn');
      return false;
    }
    if (!s.auto.orders.length) {
      this.toast('No orders in the chain yet.', 'warn');
      return false;
    }
    s.auto.active = true;
    this.path = null;
    this.emit('autopilot', { active: true });
    return true;
  }

  returnToPortOrder() {
    const s = this.s;
    if (s.ship.docked) return false;
    if (!s.crew.captain) {
      this.toast('Without a captain you steer home yourself.', 'warn');
      return false;
    }
    if (s.auto.orders[s.auto.idx]?.type !== 'port') {
      s.auto.orders.splice(s.auto.idx, 0, { type: 'port', temp: true });
    }
    return this.startChain();
  }

  nextOrder() {
    const a = this.s.auto;
    const o = a.orders[a.idx];
    this.path = null;
    a.wait = null;
    if (o?.temp) a.orders.splice(a.idx, 1);
    else a.idx += 1;
    if (a.idx >= a.orders.length) {
      if (a.loop && a.orders.length) a.idx = 0;
      else {
        a.active = false;
        a.orders = [];
        a.idx = 0;
        this.s.ship.gear = 0;
        this.toast('Order chain complete');
        this.emit('chainDone');
      }
    }
  }

  // Fuel needed to get home at the economical gear, with some margin.
  fuelToReturn() {
    const { ship } = this.s;
    const d = Math.hypot(ship.x - this.world.port.x, ship.z - this.world.port.z);
    const g = CFG.gears[CFG.cruiseGear + CFG.gearOffset];
    return (d / g.speed) * g.fuel * CFG.autopilotFuelFactor * 1.35 + 2;
  }

  divertToPort(why) {
    const a = this.s.auto;
    if (a.orders[a.idx]?.type === 'port') return;
    a.orders.splice(a.idx, 0, { type: 'port', temp: true });
    a.wait = null;
    this.path = null;
    this.toast(`Captain: ${why}, heading to port.`, 'warn');
  }

  sailTo(x, z, dt) {
    const { ship } = this.s;
    const key = `${x},${z}`;
    if (!this.path || this.pathKey !== key) {
      this.path = this.nav.findPath(ship.x, ship.z, x, z);
      this.pathKey = key;
    }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - ship.x, wp.z - ship.z) < (this.path.length > 1 ? 5 : 3)) {
      this.path.shift();
      wp = this.path[0];
    }
    if (!wp) {
      this.turnInput = 0;
      ship.gear = 0;
      return true;
    }
    const want = wrapAngle(Math.atan2(wp.x - ship.x, wp.z - ship.z) - ship.heading);
    this.turnInput = clamp(want * 2.2, -1, 1);
    ship.gear = Math.abs(want) > 1.2 ? 1 : CFG.cruiseGear;
    void dt;
    return false;
  }

  stepAutopilot(dt) {
    const s = this.s;
    const a = s.auto;
    if (s.stranded || s.action || s.minigameCageId !== null) {
      this.turnInput = 0;
      s.ship.gear = 0;
      return;
    }
    const o = a.orders[a.idx];
    if (!o) {
      this.nextOrder();
      return;
    }
    if (o.type !== 'port' && s.fuel < this.fuelToReturn()) this.divertToPort('fuel is low');
    else if (o.type !== 'port' && s.crabs >= this.maxTank) this.divertToPort('the tank is full');
    const cur = a.orders[a.idx];

    if (cur.type === 'port') {
      const arrived = this.sailTo(this.world.port.x, this.world.port.z, dt);
      if (arrived || this.canDock) {
        this.turnInput = 0;
        this.dock();
      }
      return;
    }

    if (cur.type === 'collect') {
      // Collect orders aim at wherever a cage actually sits near the mark.
      const cage = s.cages.find((c) => Math.hypot(c.x - cur.x, c.z - cur.z) < CFG.cageReach);
      if (!cage) {
        this.toast('No cage at that spot: skipping.');
        this.nextOrder();
        return;
      }
      if (!this.sailTo(cage.x, cage.z, dt)) return;
      this.turnInput = 0;
      if (s.t - cage.t0 < CFG.soakPeak) {
        a.wait = 'soak';
        return;
      }
      a.wait = null;
      if (!s.crew.deckhand) {
        this.pauseChain('Needs a deckhand to collect.');
        return;
      }
      if (this.collectByCrew()) this.nextOrder();
      return;
    }

    if (!this.sailTo(cur.x, cur.z, dt)) return;
    this.turnInput = 0;
    if (cur.type === 'drop') {
      if (!s.crew.deckhand) {
        this.pauseChain('Needs a deckhand to drop cages.');
        return;
      }
      if (Math.abs(s.ship.speed) > 1) return;
      const reason = this.dropBlockReason();
      if (reason) this.toast(`Skipped drop: ${reason}`);
      else this.dropCage();
    }
    this.nextOrder();
  }

  pauseChain(text) {
    this.s.auto.active = false;
    this.s.ship.gear = 0;
    this.toast(text, 'warn');
    this.emit('autopilot', { active: false });
  }

  // In port with a chain running the captain trades, then sails the next leg.
  stepAutopilotDocked() {
    const s = this.s;
    const a = s.auto;
    if (!a.portTimer) {
      a.portTimer = s.t + 3;
      return;
    }
    if (s.t < a.portTimer) return;
    a.portTimer = 0;
    this.sellCrabs();
    this.buy('fuel', this.maxFuel);
    this.buy('provisions', this.maxProvisions);
    if (a.orders[a.idx]?.type === 'port') this.nextOrder();
    if (a.active) {
      if (s.fuel <= 0) this.pauseChain('Not enough money for fuel.');
      else this.setSail();
    }
  }

  // ---- voyage plan and weather ---------------------------------------------
  setVoyage(minutes) {
    const v = this.s.voyage;
    v.minutes = minutes;
    v.deadline = this.s.t + minutes * 60;
    v.expired = false;
    v.snoozeUntil = null;
    if (v.ringing) {
      v.ringing = false;
      this.s.weather.overcastUntil = this.s.t + CFG.overcastAfterDismiss;
    }
    this.emit('voyageSet', { minutes });
  }

  ring() {
    const v = this.s.voyage;
    v.ringing = true;
    v.snoozeUntil = null;
    this.emit('horn');
    this.toast('Time is up. A storm is coming.', 'warn');
  }

  dismissAlarm() {
    const v = this.s.voyage;
    v.ringing = false;
    v.expired = false;
    v.deadline = null;
    v.snoozeUntil = null;
    this.s.weather.overcastUntil = this.s.t + CFG.overcastAfterDismiss;
    this.emit('alarmDismissed');
  }

  snoozeAlarm(minutes = CFG.snoozeMinutes) {
    const v = this.s.voyage;
    v.ringing = false;
    v.snoozeUntil = this.s.t + minutes * 60;
    this.emit('alarmSnoozed', { minutes });
  }

  stepVoyage() {
    const s = this.s;
    const v = s.voyage;
    if (v.snoozeUntil !== null && s.t >= v.snoozeUntil) {
      v.snoozeUntil = null;
      if (s.ship.docked) this.emit('bell');
      else this.ring();
    }
    if (v.deadline !== null && !v.expired && s.t >= v.deadline) {
      v.expired = true;
      if (s.ship.docked) {
        this.emit('bell');
        this.toast('Your voyage plan has ended. Time for a break from the break.', 'warn');
      } else this.ring();
    }
  }

  stepWeather(dt) {
    const s = this.s;
    const w = s.weather;
    const v = s.voyage;
    const stormTarget = v.ringing && !s.ship.docked ? 1 : 0;
    const buildRate = dt / CFG.stormBuildSeconds;
    w.storm = stormTarget ? Math.min(1, w.storm + buildRate) : Math.max(0, w.storm - dt / 20);
    const keepOvercast = v.snoozeUntil !== null || s.t < w.overcastUntil || v.ringing;
    w.overcast = approach(w.overcast, keepOvercast ? 1 : 0, dt / 15);
  }

  // ---- persistence ----------------------------------------------------------
  serialize() {
    return JSON.stringify(this.s);
  }
}
