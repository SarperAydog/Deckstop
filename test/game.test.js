import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { generateWorld } from '../src/sim/world.js';
import { Game, cageYield, STEP } from '../src/sim/game.js';

const world = generateWorld(1234);
const newGame = () => new Game(world);
const run = (g, seconds) => {
  for (let i = 0; i < seconds / STEP; i++) g.step(STEP);
};

// Moves the ship to open water and stops it there.
function putAtSea(g) {
  const s = g.s;
  s.ship.docked = false;
  let spot = null;
  for (let r = 60; r < 300 && !spot; r += 5) {
    for (let a = 0; a < 6.28; a += 0.3) {
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (world.shoreDistance(x, z) > 15) {
        spot = { x, z };
        break;
      }
    }
  }
  s.ship.x = spot.x;
  s.ship.z = spot.z;
  s.ship.speed = 0;
  s.ship.gear = 0;
  return spot;
}

test('world generation is deterministic and the berth is in open water', () => {
  const again = generateWorld(1234);
  assert.equal(again.islands.length, world.islands.length);
  assert.equal(again.density(50, 80), world.density(50, 80));
  assert.ok(world.shoreDistance(world.port.x, world.port.z) > 4, 'berth too close to land');
  assert.ok(world.heightAt(0, 0) > 1, 'port island should exist at the origin');
});

test('cage yield rises to its peak, then escapes softly down to the floor', () => {
  const cage = { t0: 0, density: 0.5 };
  const cap = CFG.cageCapMin + CFG.cageCapDensity * 0.5;
  assert.equal(cageYield(cage, 0), 0);
  assert.ok(cageYield(cage, CFG.soakPeak / 2) < cap);
  assert.ok(Math.abs(cageYield(cage, CFG.soakPeak) - cap) < 1e-6);
  assert.ok(cageYield(cage, CFG.soakPeak + 60) < cap);
  const floor = cageYield(cage, CFG.soakPeak + CFG.escapeTime * 10);
  assert.ok(Math.abs(floor - cap * CFG.escapeFloor) < 1e-6);
});

test('higher gears are faster and burn more fuel per metre', () => {
  const burnFor = (gear) => {
    const g = newGame();
    putAtSea(g);
    g.s.ship.heading = 0;
    g.s.ship.gear = gear;
    const x0 = g.s.ship.x;
    const z0 = g.s.ship.z;
    const f0 = g.s.fuel;
    run(g, 6);
    return { dist: Math.hypot(g.s.ship.x - x0, g.s.ship.z - z0), burn: f0 - g.s.fuel };
  };
  const cruise = burnFor(2);
  const full = burnFor(4);
  assert.ok(full.dist > cruise.dist);
  assert.ok(full.burn / full.dist > cruise.burn / cruise.dist);
});

test('space brakes to a stop and shifts to neutral', () => {
  const g = newGame();
  putAtSea(g);
  g.s.ship.gear = 3;
  run(g, 3);
  assert.ok(g.s.ship.speed > 3);
  g.brake();
  run(g, 3);
  assert.equal(g.s.ship.gear, 0);
  assert.ok(Math.abs(g.s.ship.speed) < 0.01);
});

test('drop, soak, ready notice and minigame collect pay more than crew', () => {
  const g = newGame();
  putAtSea(g);
  assert.ok(g.dropCage());
  run(g, CFG.dropDuration + 0.2);
  assert.equal(g.s.cages.length, 1);
  assert.equal(g.cagesAboard, g.maxCages - 1);
  run(g, CFG.soakPeak + 1);
  assert.ok(g.drainEvents().some((e) => e.type === 'cageReady'));
  const cage = g.s.cages[0];
  const atPeak = cageYield(cage, g.s.t);
  assert.ok(g.startMinigame());
  const perfect = g.finishMinigame(1);
  assert.equal(perfect, Math.round(atPeak * CFG.minigameMax));
  assert.equal(g.s.cages.length, 0);
  assert.equal(g.cagesAboard, g.maxCages);
});

test('crew collect needs a deckhand and yields below a good player', () => {
  const g = newGame();
  putAtSea(g);
  g.s.cages.push({ id: 99, x: g.s.ship.x, z: g.s.ship.z, t0: g.s.t - CFG.soakPeak, density: 1, ready: true });
  assert.equal(g.collectByCrew(), false);
  g.s.crew.deckhand = true;
  assert.ok(g.collectByCrew());
  run(g, CFG.crewCollectDuration + 0.2);
  const expected = (CFG.cageCapMin + CFG.cageCapDensity) * CFG.minigameMax;
  assert.ok(g.s.crabs > 0 && g.s.crabs < expected);
});

test('a full tank refuses new crab', () => {
  const g = newGame();
  putAtSea(g);
  g.s.cages.push({ id: 5, x: g.s.ship.x, z: g.s.ship.z, t0: g.s.t - CFG.soakPeak, density: 1, ready: true });
  g.s.crabs = g.maxTank;
  assert.equal(g.startMinigame(), false);
  assert.equal(g.s.cages.length, 1);
});

test('running out of provisions slows the ship', () => {
  const speedWith = (prov) => {
    const g = newGame();
    putAtSea(g);
    g.s.provisions = prov;
    g.s.ship.gear = 3;
    run(g, 4);
    return g.s.ship.speed;
  };
  assert.ok(speedWith(0) < speedWith(50));
});

test('empty tank strands the ship, tow charges money and returns to port', () => {
  const g = newGame();
  putAtSea(g);
  g.s.fuel = 0.05;
  g.s.ship.gear = 2;
  run(g, 3);
  assert.ok(g.s.stranded);
  const before = g.s.money;
  const cost = g.towCost();
  assert.ok(g.callTow());
  assert.equal(g.s.money, before - cost);
  run(g, 200);
  assert.ok(g.s.ship.docked);
  assert.equal(g.s.towing, false);
  assert.equal(g.s.stranded, false);
});

test('port trade: sell crabs, buy up to the cap, debt floor holds', () => {
  const g = newGame();
  g.s.crabs = 10;
  g.s.money = 0;
  assert.equal(g.sellCrabs(), 10 * CFG.crabPrice);
  g.s.fuel = 0;
  g.s.money = -140;
  const bought = g.buy('fuel', 1000);
  assert.ok(bought > 0 && bought <= 10.01);
  assert.ok(g.s.money >= CFG.debtFloor - 1e-9);
  assert.ok(g.setSail());
});

test('upgrades raise capacity and are limited by money and levels', () => {
  const g = newGame();
  g.s.money = 0;
  assert.equal(g.upgrade('cages'), false);
  g.s.money = 1e6;
  const before = g.maxCages;
  assert.ok(g.upgrade('cages'));
  assert.ok(g.maxCages > before);
  while (g.upgradeCost('cages') !== null) g.upgrade('cages');
  assert.equal(g.upgrade('cages'), false);
});

test('autopilot needs a captain', () => {
  const g = newGame();
  putAtSea(g);
  g.addOrder({ type: 'go', x: g.s.ship.x + 30, z: g.s.ship.z });
  assert.equal(g.startChain(), false);
});

test('a looping chain drops, soaks, collects, sells and sails again by itself', () => {
  const g = newGame();
  g.s.crew.captain = true;
  g.s.crew.deckhand = true;
  g.s.levels.fuel = 4;
  g.s.fuel = g.maxFuel;
  let spot = null;
  for (let a = 0.3; a < 3 && !spot; a += 0.1) {
    const x = world.port.x + Math.sin(a - 1.5) * 90;
    const z = world.port.z + Math.cos(a - 1.5) * 90;
    if (world.shoreDistance(x, z) > 10) spot = { x, z };
  }
  assert.ok(spot, 'needs a spot of open water');
  g.addOrder({ type: 'drop', ...spot });
  g.addOrder({ type: 'collect', ...spot });
  g.addOrder({ type: 'port' });
  g.s.auto.loop = true;
  assert.ok(g.startChain());
  // A chain started in port: the captain trades first, then casts off.
  run(g, 5);
  assert.equal(g.s.ship.docked, false);
  run(g, 60);
  assert.equal(g.s.cages.length, 1, 'cage should be in the water');
  run(g, CFG.soakPeak + 120);
  assert.ok(g.s.stats.earned > 0, 'crabs should have been sold');
  assert.ok(g.s.auto.active, 'loop keeps going');
});

test('autopilot paths around land instead of through it', () => {
  const g = newGame();
  g.s.ship.docked = false;
  const from = { x: 0, z: -60 };
  const to = { x: world.port.x, z: world.port.z };
  let closest = Infinity;
  const path = g.nav.findPath(from.x, from.z, to.x, to.z);
  let px = from.x;
  let pz = from.z;
  for (const wp of path) {
    const d = Math.hypot(wp.x - px, wp.z - pz);
    for (let i = 0; i <= d; i++) {
      closest = Math.min(closest, world.shoreDistance(px + ((wp.x - px) * i) / d, pz + ((wp.z - pz) * i) / d));
    }
    px = wp.x;
    pz = wp.z;
  }
  assert.ok(path.length > 1);
  assert.ok(closest > 2, `path grazes land: ${closest}`);
});

test('voyage plan: at port only a bell, at sea the storm builds; dismiss clears it', () => {
  const g = newGame();
  g.setVoyage(1);
  run(g, 61);
  assert.equal(g.s.voyage.expired, true);
  assert.equal(g.s.voyage.ringing, false);
  assert.ok(g.drainEvents().some((e) => e.type === 'bell'));
  assert.equal(g.s.weather.storm, 0);

  // Setting sail after the time has passed rings the alarm.
  g.setSail();
  assert.equal(g.s.voyage.ringing, true);
  run(g, CFG.stormBuildSeconds + 2);
  assert.equal(g.s.weather.storm, 1);

  g.dismissAlarm();
  assert.equal(g.s.voyage.ringing, false);
  run(g, 25);
  assert.equal(g.s.weather.storm, 0);
  assert.ok(g.s.weather.overcast > 0);
  run(g, CFG.overcastAfterDismiss + 20);
  assert.equal(g.s.weather.overcast, 0);
});

test('snooze keeps it overcast without storm, then the horn sounds again', () => {
  const g = newGame();
  putAtSea(g);
  g.setVoyage(0.01);
  run(g, 2);
  assert.equal(g.s.voyage.ringing, true);
  g.snoozeAlarm(1);
  g.drainEvents();
  run(g, 40);
  assert.equal(g.s.voyage.ringing, false);
  assert.equal(g.s.weather.storm, 0);
  assert.ok(g.s.weather.overcast > 0.9);
  run(g, 25);
  assert.equal(g.s.voyage.ringing, true);
  assert.ok(g.drainEvents().some((e) => e.type === 'horn'));
});

test('state survives a JSON round trip', () => {
  const g = newGame();
  putAtSea(g);
  g.dropCage();
  run(g, 5);
  const copy = new Game(world, JSON.parse(g.serialize()));
  assert.deepEqual(copy.s, g.s);
  run(copy, 2);
  assert.ok(copy.s.t > g.s.t);
});
