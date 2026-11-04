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
  const first = CFG.ships.auk;
  return {
    v: 2,
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
      helm: 0,
      yawRate: 0,
      docked: true,
    },
    fuel: first.fuel,
    provisions: first.provisions,
    crabs: 0,
    wagesOwed: 0,
    levels: { fuel: 0, provisions: 0, tank: 0, cages: 0, radar: 0 },
    crew: { captain: false, deckhand: false },
    fleet: { current: 'auk', owned: ['auk'] },
    waypoint: null,
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
    this.turnInput = 0; // the autopilot's wish for the rudder
    this.helmInput = 0; // -1, 0 or 1 while the player holds A or D
    this.helmCentering = false;
    this.timeScale = 1; // debug panel only
    this.path = null;
    this.pathKey = null;
    this.prev = { x: this.s.ship.x, z: this.s.ship.z, heading: this.s.ship.heading };
    this.warned = { fuel: false, provisions: false, tank: false };
    this.lastAground = -10;
    this.lastReadyNote = -10;
    this.alpha = 0;
  }

  // ---- derived values -------------------------------------------------------
  get shipClass() {
    return CFG.ships[this.s.fleet.current];
  }
  // A refit adds its step on top of whatever the current hull offers.
  upgradeBonus(key, level = this.s.levels[key]) {
    const v = CFG.upgrades[key].values;
    return v[level] - v[0];
  }
  upgradeValue(key) {
    return this.shipClass[key] + this.upgradeBonus(key);
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
    return Math.max(0, this.maxCages - this.s.cages.length);
  }
  get topSpeed() {
    return CFG.gears[CFG.gears.length - 1].speed * this.shipClass.speed;
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
    if (ship.docked || towing || ship.berthing) return false;
    // The berth is on the east side of the pier: no ghosting through the planks.
    const { port } = this.world;
    if (ship.x < port.pier.x1 && ship.z > port.pier.z0) return false;
    return Math.hypot(ship.x - port.x, ship.z - port.z) < CFG.dockReach;
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
    this.acc += Math.min(realDt, 5) * this.timeScale;
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
    else if (s.ship.berthing) this.stepBerthing(dt);
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
    ship.heading += wrapAngle((ship.mooredHeading ?? port.heading) - ship.heading) * k;
    ship.speed = 0;
    ship.gear = 0;
    ship.helm = 0;
    ship.rudder = 0;
    ship.yawRate = 0;
    if (this.s.auto.active) this.stepAutopilotDocked();
  }

  // Coming alongside: the way comes off her, she creeps in and swings parallel to
  // the pier, bow whichever way she arrived. The moorings go on only at the end.
  beginBerthing() {
    const { ship } = this.s;
    if (!this.canDock) return false;
    ship.berthing = true;
    ship.gear = 0;
    ship.helm = 0;
    ship.rudder = 0;
    ship.yawRate = 0;
    const north = Math.abs(wrapAngle(this.world.port.heading - ship.heading));
    ship.mooredHeading = north <= Math.PI / 2 ? this.world.port.heading : wrapAngle(this.world.port.heading + Math.PI);
    this.path = null;
    this.emit('berthing');
    return true;
  }

  stepBerthing(dt) {
    const { ship } = this.s;
    const { port } = this.world;
    const dx = port.x - ship.x;
    const dz = port.z - ship.z;
    const dist = Math.hypot(dx, dz);
    const wanted = Math.max(CFG.berthMinSpeed, Math.min(CFG.berthSpeed, dist * 0.22));
    ship.speed = approach(ship.speed, wanted, CFG.berthDecel * dt);
    const face = dist > 4 ? Math.atan2(dx, dz) : ship.mooredHeading;
    const turn = wrapAngle(face - ship.heading);
    // Backing in when the berth lies astern is more seamanlike than spinning round.
    const aim = dist > 4 && Math.abs(turn) > Math.PI / 2 ? wrapAngle(turn + Math.PI) : turn;
    ship.heading += clamp(aim * 0.7, -CFG.berthTurn, CFG.berthTurn) * dt;
    const step = Math.min(dist, Math.abs(ship.speed) * dt);
    if (dist > 1e-3) {
      ship.x += (dx / dist) * step;
      ship.z += (dz / dist) * step;
    }
    if (dist - step < 0.05 && Math.abs(wrapAngle(ship.mooredHeading - ship.heading)) < 0.03) {
      ship.berthing = false;
      this.dock();
    }
  }

  stepShip(dt) {
    const s = this.s;
    const ship = s.ship;
    const storm = s.weather.storm;
    const busy = s.minigameCageId !== null;

    const cls = this.shipClass;
    let target = this.gear.speed * cls.speed;
    if (this.provisionsOut) target *= CFG.noProvisionSpeed;
    target *= 1 - 0.25 * storm;
    if (s.fuel <= 0 || busy) target = 0;

    const braking = ship.gear === 0 || Math.abs(target) < Math.abs(ship.speed);
    ship.speed = approach(ship.speed, target, (braking ? CFG.brake : CFG.accel) * dt);

    // The wheel stays wherever it was left, like a real helm. Only the autopilot
    // or an explicit centring moves it back.
    if (s.auto.active) {
      ship.helm = approach(ship.helm, this.turnInput, 3.2 * dt);
    } else if (this.helmInput) {
      this.helmCentering = false;
      ship.helm = clamp(ship.helm + this.helmInput * CFG.helmRate * dt, -1, 1);
    } else if (this.helmCentering) {
      ship.helm = approach(ship.helm, 0, CFG.helmRate * 2 * dt);
      if (ship.helm === 0) this.helmCentering = false;
    } else if (Math.abs(ship.helm) < 0.05) ship.helm = 0;
    ship.rudder = approach(ship.rudder, busy ? 0 : ship.helm, (s.auto.active ? 3.2 : CFG.rudderRate) * dt);
    // A loaded hull needs way on to answer the helm, and it takes time to start
    // swinging and time to stop.
    const authority = 0.25 + 0.75 * Math.min(1, Math.abs(ship.speed) / 2.5);
    const direction = ship.speed < -0.05 ? -1 : 1;
    const wantYaw = ship.rudder * CFG.turnRate * cls.turn * authority * direction;
    const yawK = CFG.yawLag > 0 ? 1 - Math.exp(-dt / CFG.yawLag) : 1;
    ship.yawRate = (ship.yawRate ?? 0) + (wantYaw - (ship.yawRate ?? 0)) * yawK;
    ship.heading += ship.yawRate * dt;

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
    const here = this.world.navDistance(ship.x, ship.z);
    const there = this.world.navDistance(nx, nz);
    if (there < 2 && there < here) {
      if (s.t - this.lastAground > 3 && Math.abs(ship.speed) > 1) {
        this.emit('aground');
        this.toast('Too close to the rocks. Shift astern with S.', 'warn');
        this.lastAground = s.t;
      }
      ship.speed = -ship.speed * 0.15;
      ship.gear = 0;
    } else {
      const b = this.world.bounds;
      ship.x = clamp(nx, b.x0, b.x1);
      ship.z = clamp(nz, b.z0, b.z1);
    }

    if (Math.abs(ship.speed) > 0.05) {
      const fuelRate = this.gear.fuel * cls.burn * CFG.tune.burn * (s.auto.active ? CFG.autopilotFuelFactor : 1);
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
    if (s.waypoint && Math.hypot(s.waypoint.x - s.ship.x, s.waypoint.z - s.ship.z) < CFG.waypointReach) {
      s.waypoint = null;
      this.toast('Waypoint reached.', 'good');
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
    if (s.ship.docked || s.ship.berthing) return 'You cannot drop cages in port.';
    if (s.action || s.minigameCageId !== null) return 'The deck is busy.';
    if (this.cagesAboard <= 0) return 'No cages left aboard.';
    if (Math.abs(s.ship.speed) > CFG.dropMaxSpeed * this.shipClass.speed) return 'Too fast: slow to gear 1 to drop.';
    if (this.world.shoreDistance(s.ship.x, s.ship.z) < CFG.minDropShoreDistance) return 'Too shallow here.';
    if (Math.hypot(s.ship.x - this.world.port.x, s.ship.z - this.world.port.z) < CFG.minDropPortDistance) return 'Not in the harbour fairway.';
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
    if (ship.berthing) ship.berthing = false; // changed your mind: back under way
    ship.gear = clamp(ship.gear + delta, -1, CFG.gears.length - 1 - CFG.gearOffset);
  }

  brake() {
    if (this.s.ship.docked || this.s.towing || this.s.ship.berthing) return;
    this.s.ship.gear = 0;
  }

  centerHelm() {
    this.helmCentering = true;
  }

  // ---- cage management ------------------------------------------------------
  cageInfo(c) {
    const age = this.s.t - c.t0;
    const ready = age >= CFG.soakPeak;
    const late = age > CFG.soakPeak + 20;
    const { ship } = this.s;
    return {
      age,
      ready,
      late,
      untilReady: Math.max(0, CFG.soakPeak - age),
      soak: Math.min(1, age / CFG.soakPeak),
      crabs: Math.round(cageYield(c, this.s.t)),
      lost: ready ? Math.round(cageYield(c, c.t0 + CFG.soakPeak) - cageYield(c, this.s.t)) : 0,
      distance: Math.hypot(c.x - ship.x, c.z - ship.z),
      status: !ready ? 'Soaking' : late ? 'Escaping' : 'Ready',
    };
  }

  setWaypoint(x, z) {
    this.s.waypoint = { x, z };
  }

  clearWaypoint() {
    this.s.waypoint = null;
  }

  orderCollect(id) {
    const c = this.s.cages.find((k) => k.id === id);
    if (!c) return false;
    if (!this.s.crew.captain) {
      this.toast('Hire a captain to give orders from the chart.', 'warn');
      return false;
    }
    this.addOrder({ type: 'collect', x: c.x, z: c.z });
    return true;
  }

  // Queues every ready cage, nearest first, then a run home to sell.
  orderCollectReady() {
    const s = this.s;
    if (!s.crew.captain || !s.crew.deckhand) {
      this.toast('A round-up needs both a captain and a deckhand.', 'warn');
      return 0;
    }
    const left = s.cages.filter((c) => s.t - c.t0 >= CFG.soakPeak);
    if (!left.length) {
      this.toast('No cages are ready yet.');
      return 0;
    }
    let { x, z } = s.ship;
    const n = left.length;
    while (left.length) {
      let best = 0;
      let bd = Infinity;
      left.forEach((c, i) => {
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      const [c] = left.splice(best, 1);
      this.addOrder({ type: 'collect', x: c.x, z: c.z });
      x = c.x;
      z = c.z;
    }
    this.addOrder({ type: 'port' });
    return n;
  }

  // Cut a cage loose from anywhere: it frees the slot, but the catch is lost.
  abandonCage(id) {
    const s = this.s;
    const c = s.cages.find((k) => k.id === id);
    if (!c) return false;
    if (s.money < CFG.cageWriteOff) {
      this.toast(`A replacement cage costs $${CFG.cageWriteOff}.`, 'warn');
      return false;
    }
    s.money -= CFG.cageWriteOff;
    s.cages = s.cages.filter((k) => k.id !== id);
    s.auto.orders = s.auto.orders.filter((o) => o.type !== 'collect' || Math.hypot(o.x - c.x, o.z - c.z) > 1);
    s.auto.idx = Math.min(s.auto.idx, Math.max(0, s.auto.orders.length - 1));
    this.toast(`Cage written off: -$${CFG.cageWriteOff}`, 'warn');
    return true;
  }

  // ---- fleet ---------------------------------------------------------------
  buyShip(id) {
    const s = this.s;
    const cls = CFG.ships[id];
    if (!cls || !s.ship.docked || s.fleet.owned.includes(id) || s.money < cls.cost) return false;
    s.money -= cls.cost;
    s.fleet.owned.push(id);
    this.emit('upgraded', { key: id });
    this.boardShip(id);
    return true;
  }

  boardShip(id) {
    const s = this.s;
    if (!s.ship.docked || !s.fleet.owned.includes(id) || s.fleet.current === id) return false;
    const room = CFG.ships[id].tank + this.upgradeBonus('tank');
    if (s.crabs > room) {
      this.toast('Sell your catch first: it will not fit in that tank.', 'warn');
      return false;
    }
    s.fleet.current = id;
    s.fuel = Math.min(s.fuel, this.maxFuel);
    s.provisions = Math.min(s.provisions, this.maxProvisions);
    this.emit('shipChanged', { id });
    this.toast(`You take the helm of the ${CFG.ships[id].name}.`, 'good');
    return true;
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
    s.ship.mooredHeading = null;
    s.ship.helm = 0;
    s.ship.rudder = 0;
    s.ship.gear = 0; // casting off leaves her idling: the engine is the player's call
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
    while (wp && Math.hypot(wp.x - ship.x, wp.z - ship.z) < (this.path.length > 1 ? 7 : 4.5)) {
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
    // Ease off for a big turn or the last stretch, so she does not circle the mark.
    const close = this.path.length === 1 && Math.hypot(wp.x - ship.x, wp.z - ship.z) < 14;
    ship.gear = Math.abs(want) > 0.9 || close ? 1 : CFG.cruiseGear;
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
        this.beginBerthing();
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
