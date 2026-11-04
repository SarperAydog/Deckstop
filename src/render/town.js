// The harbour town and the wild coast around it. All geometry is built from painted
// boxes and prisms, laid out by hand after the reference painting: long pier, crane,
// red crab warehouse, breakwater with its beacon, striped lighthouse on the point.
import * as THREE from 'three';
import { fbm, TOWN } from '../sim/world.js';
import { box, cone, cyl, frostCone, gable, mergeChunks, paint, place, placeAll, rock } from './kit.js';

const GROUND = 1.42;
const SNOW = '#f4f7f9';
const WOOD = '#7b6a5c';
const WOOD_D = '#54493f';
const GLASS = '#34506a';
const WHITE = '#f2f3f1';

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.r *= k;
  c.g *= k;
  c.b *= k;
  return `#${c.getHexString()}`;
};

// Flat emblem on a warehouse wall: the crab of the local cooperative.
function crabEmblem(size, color) {
  const s = size;
  const out = [];
  const flat = (geo) => {
    const g = paint(geo, color);
    return g;
  };
  out.push(place(flat(new THREE.CircleGeometry(0.42 * s, 12)), 0, 0, 0, 0, 1.25, 0.8, 1));
  const eye = () => flat(new THREE.CircleGeometry(0.06 * s, 6));
  out.push(place(eye(), -0.16 * s, 0.4 * s, 0));
  out.push(place(eye(), 0.16 * s, 0.4 * s, 0));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const leg = flat(new THREE.PlaneGeometry(0.62 * s, 0.075 * s));
      place(leg, side * 0.72 * s, (-0.02 - i * 0.2) * s, 0, 0, 1, 1, 1, 0, side * (-0.45 - i * 0.26));
      out.push(leg);
    }
    const arm = flat(new THREE.PlaneGeometry(0.42 * s, 0.09 * s));
    place(arm, side * 0.62 * s, 0.32 * s, 0, 0, 1, 1, 1, 0, side * 0.75);
    out.push(arm);
    const claw = flat(new THREE.CircleGeometry(0.2 * s, 7));
    place(claw, side * 0.82 * s, 0.6 * s, 0, 0, 1, 0.8, 1, 0, side * -0.5);
    out.push(claw);
  }
  return out;
}

let windowCount = 0;
function windowAt(parts, x, y, z, ry, w = 0.55, h = 0.72) {
  const frame = box(w + 0.14, h + 0.14, 0.05, WHITE);
  // Someone is home behind about one window in three.
  const glass = box(w, h, 0.07, windowCount++ % 3 === 1 ? '#f2d58c' : GLASS);
  const dx = Math.sin(ry) * 0.05;
  const dz = Math.cos(ry) * 0.05;
  parts.push(place(box(w + 0.2, 0.06, 0.1, SNOW), x + dx, y - h / 2 - 0.09, z + dz, ry));
  const barV = box(0.05, h, 0.09, WHITE);
  const barH = box(w, 0.05, 0.09, WHITE);
  parts.push(place(frame, x, y, z, ry), place(glass, x, y, z, ry), place(barV, x, y, z, ry), place(barH, x, y, z, ry));
}

// A wooden house. The ridge runs along local Z. Walls are clad in thin vertical
// planks with white corner boards; the roof is under a thick slab of snow.
function house(o) {
  const { w, d, h = 2, rh = w * 0.42, wall, chimney = true, doors = 1, windows = true, trim = WHITE, porch = false } = o;
  const parts = [];
  const line = shade(wall, 0.72);
  parts.push(place(box(w + 0.18, 0.34, d + 0.18, '#6d7680'), 0, 0.15, 0));
  parts.push(place(box(w, h, d, wall), 0, h / 2, 0));
  parts.push(place(gable(w, rh, d, wall), 0, h, 0));

  // Cladding.
  const spacing = 0.42;
  for (let z = -d / 2 + spacing; z < d / 2; z += spacing) {
    for (const sx of [-1, 1]) parts.push(place(box(0.035, h, 0.05, line), sx * (w / 2 + 0.008), h / 2, z));
  }
  for (let x = -w / 2 + spacing; x < w / 2; x += spacing) {
    const top = h + rh * (1 - Math.abs(x) / (w / 2)) - 0.04;
    for (const sz of [-1, 1]) parts.push(place(box(0.05, top, 0.035, line), x, top / 2, sz * (d / 2 + 0.008)));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(place(box(0.13, h, 0.13, trim), (sx * w) / 2, h / 2, (sz * d) / 2));
  }

  // Snow roof: two thick slabs with a darker eave under them.
  const ov = 0.34;
  const run = w / 2 + ov;
  const slope = Math.atan2(rh, w / 2);
  const len = run / Math.cos(slope);
  const midY = h + rh - (run / 2) * Math.tan(slope);
  for (const sx of [-1, 1]) {
    parts.push(place(box(len, 0.1, d + ov * 2, shade(wall, 0.55)), (sx * run) / 2, midY + 0.02, 0, 0, 1, 1, 1, 0, -sx * slope));
    parts.push(place(box(len + 0.04, 0.2, d + ov * 2 + 0.1, SNOW), (sx * run) / 2, midY + 0.17, 0, 0, 1, 1, 1, 0, -sx * slope));
  }

  // Ridge line of the snow, then icicles along both eaves.
  parts.push(place(box(0.2, 0.08, d + ov * 2 + 0.08, '#e3ebf0'), 0, h + rh + 0.2, 0));
  const eaveY = h + rh - run * Math.tan(slope) - 0.02;
  for (let z = -d / 2; z <= d / 2; z += 0.62) {
    const hang = 0.14 + ((Math.abs(z * 31 + w * 7) % 1) * 0.2);
    for (const sx of [-1, 1]) {
      parts.push(place(paint(new THREE.ConeGeometry(0.035, hang, 4), '#dcecf3'), sx * (run - 0.03), eaveY - hang / 2, z, 0, 1, 1, 1, Math.PI));
    }
  }
  // Soft drifts piled against the two long walls.
  for (const sx of [-1, 1]) {
    parts.push(place(paint(new THREE.IcosahedronGeometry(1, 1), SNOW), sx * (w / 2 + 0.08), 0.02, -d * 0.16, 0, 0.32, 0.3, d * 0.42));
  }

  if (chimney) {
    const cz = -d * 0.22;
    parts.push(place(box(0.42, 1.1, 0.42, '#8e4a3d'), w * 0.2, h + rh * 0.72, cz));
    parts.push(place(box(0.52, 0.14, 0.52, SNOW), w * 0.2, h + rh * 0.72 + 0.6, cz));
  }

  if (windows) {
    const rows = Math.max(1, Math.floor(d / 1.6));
    for (let i = 0; i < rows; i++) {
      const z = -d / 2 + (d * (i + 0.5)) / rows;
      windowAt(parts, w / 2 + 0.03, h * 0.58, z, Math.PI / 2);
      windowAt(parts, -w / 2 - 0.03, h * 0.58, z, Math.PI / 2);
    }
    windowAt(parts, 0, h + rh * 0.3, d / 2 + 0.03, 0, 0.45, 0.55);
    windowAt(parts, 0, h + rh * 0.3, -d / 2 - 0.03, 0, 0.45, 0.55);
  }
  for (let i = 0; i < doors; i++) {
    const x = doors === 1 ? -w * 0.2 : -w * 0.25 + (w * 0.5 * i) / (doors - 1);
    // Door lamp, and the steps' cap of trodden snow.
    parts.push(place(box(0.1, 0.14, 0.1, '#f2d58c'), x + 0.5, 1.42, d / 2 + 0.06));
    parts.push(place(box(0.74, 1.3, 0.05, WHITE), x, 0.78, d / 2 + 0.03));
    parts.push(place(box(0.58, 1.2, 0.08, shade(wall, 0.62)), x, 0.74, d / 2 + 0.03));
    parts.push(place(box(0.9, 0.12, 0.42, WOOD), x, 0.1, d / 2 + 0.24));
  }
  if (porch) {
    parts.push(place(box(w * 0.7, 0.14, 1.1, WOOD), 0, 0.28, d / 2 + 0.56));
    parts.push(place(box(w * 0.74, 0.12, 1.24, SNOW), 0, 1.72, d / 2 + 0.6));
    for (const sx of [-1, 1]) parts.push(place(box(0.08, 1.45, 0.08, WHITE), sx * w * 0.33, 0.98, d / 2 + 1.05));
  }
  return parts;
}

function fence(parts, x0, z0, x1, z1) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ry = Math.atan2(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / 1.3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    parts.push(place(box(0.12, 0.85, 0.12, WOOD_D), x0 + (x1 - x0) * t, GROUND + 0.34, z0 + (z1 - z0) * t));
  }
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  parts.push(place(box(0.06, 0.09, len, WOOD), mx, GROUND + 0.62, mz, ry));
  parts.push(place(box(0.06, 0.09, len, WOOD), mx, GROUND + 0.32, mz, ry));
}

function pole(parts, x, z, h = 4, arm = true) {
  parts.push(place(cyl(0.06, 0.09, h, 5, '#3f3a38'), x, GROUND + h / 2, z));
  if (arm) {
    parts.push(place(box(1.1, 0.08, 0.08, '#3f3a38'), x, GROUND + h - 0.45, z, 0.7));
    parts.push(place(box(0.8, 0.08, 0.08, '#3f3a38'), x, GROUND + h - 0.85, z, 0.7));
  }
}

function lamp(parts, x, y, z) {
  parts.push(place(cyl(0.05, 0.07, 2.6, 5, '#30373d'), x, y + 1.3, z));
  parts.push(place(box(0.5, 0.06, 0.06, '#30373d'), x + 0.2, y + 2.6, z));
  parts.push(place(box(0.22, 0.12, 0.2, '#f4e2a6'), x + 0.42, y + 2.52, z));
}

function crates(parts, x, y, z, seed = 1) {
  const pal = ['#5b7f7a', '#7a5f4b', '#3f5c66', '#8d6f4d', '#44626a'];
  for (let i = 0; i < 4; i++) {
    const s = 0.42 + ((seed * (i + 3)) % 5) * 0.06;
    const dx = ((seed + i * 7) % 5) * 0.32 - 0.6;
    const dz = ((seed * 3 + i * 5) % 5) * 0.28 - 0.5;
    parts.push(place(box(s, s, s, pal[(seed + i) % pal.length]), x + dx, y + s / 2, z + dz, i * 0.4));
    if (i === 0) parts.push(place(box(s * 0.9, s * 0.9, s * 0.9, pal[(seed + 2) % pal.length]), x + dx, y + s * 1.45, z + dz, 0.2));
  }
}

function barrel(parts, x, y, z, color = '#7e4c3a') {
  parts.push(place(cyl(0.2, 0.2, 0.5, 8, color), x, y + 0.25, z));
}

// Conifer: three stacked cones in dark teal, faceted, with a little snow on top.
export function conifer(x, y, z, s, seed) {
  const pal = ['#2f5f5c', '#274f50', '#376860', '#2c5656'];
  const c = pal[seed % 4];
  const frost = '#cfe0e0';
  return [
    place(cyl(0.09, 0.14, 0.6, 5, '#3b2f2b'), x, y + 0.25 * s, z, 0, s),
    place(frostCone(0.9, 1.05, 7, shade(c, 0.86), shade(c, 1.28)), x, y + 0.82 * s, z, seed, s),
    place(frostCone(0.74, 1.05, 7, c, frost), x, y + 1.42 * s, z, seed + 0.9, s),
    place(frostCone(0.56, 1, 7, shade(c, 1.1), frost), x, y + 2.05 * s, z, seed + 1.7, s),
    place(frostCone(0.36, 0.86, 6, shade(c, 1.2), '#f1f6f6'), x, y + 2.66 * s, z, seed + 2.4, s),
  ];
}

function lighthouse(parts, x, y, z, scale, band, cap) {
  const tiers = 7;
  const H = 8.5 * scale;
  const R = 1.25 * scale;
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers;
    const t1 = (i + 1) / tiers;
    const r0 = R * (1 - t0 * 0.34);
    const r1 = R * (1 - t1 * 0.34);
    const col = i % 2 ? WHITE : band;
    parts.push(place(cyl(r1, r0, H / tiers, 12, col), x, y + H * (t0 + t1) * 0.5, z));
  }
  const top = y + H;
  parts.push(place(cyl(R * 0.98, R * 0.86, 0.22, 12, '#39424a'), x, top + 0.1, z));
  parts.push(place(cyl(R * 0.5, R * 0.5, 1.05 * scale, 10, '#d9e8ee'), x, top + 0.2 + 0.52 * scale, z));
  parts.push(place(cyl(R * 0.34, R * 0.34, 0.9 * scale, 8, '#f6e6a8'), x, top + 0.2 + 0.5 * scale, z));
  parts.push(place(cone(R * 0.64, 0.82 * scale, 10, cap), x, top + 0.2 + 1.42 * scale, z));
  parts.push(place(cyl(0.05, 0.05, 0.5, 5, '#39424a'), x, top + 0.2 + 2 * scale, z));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.283;
    parts.push(place(box(0.05, 0.42, 0.05, '#39424a'), x + Math.cos(a) * R * 0.92, top + 0.42, z + Math.sin(a) * R * 0.92));
  }
  const ring = paint(new THREE.TorusGeometry(R * 0.92, 0.035, 4, 14), '#39424a');
  parts.push(place(ring, x, top + 0.62, z, 0, 1, 1, 1, Math.PI / 2));
  windowAt(parts, x, y + H * 0.55, z + R * 0.81, 0, 0.35, 0.5);
}

function crane(parts, x, y, z, ry) {
  const c = '#d6a432';
  const d = '#b4852a';
  const lat = [];
  const H = 8.4;
  lat.push(place(box(2.1, 0.5, 2.1, '#5a6068'), 0, 0.25, 0));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) lat.push(place(box(0.14, H, 0.14, c), sx * 0.55, H / 2 + 0.3, sz * 0.55, 0, 1, 1, 1, sz * -0.03, sx * 0.03));
  }
  for (let i = 0; i < 6; i++) {
    const yy = 0.8 + i * 1.32;
    lat.push(place(box(1.2, 0.08, 0.08, d), 0, yy, 0.56), place(box(1.2, 0.08, 0.08, d), 0, yy, -0.56));
    lat.push(place(box(0.08, 0.08, 1.2, d), 0.56, yy, 0), place(box(0.08, 0.08, 1.2, d), -0.56, yy, 0));
    lat.push(place(box(0.06, 1.55, 0.06, d), 0, yy + 0.66, 0.56, 0, 1, 1, 1, 0, i % 2 ? 0.72 : -0.72));
    lat.push(place(box(0.06, 1.55, 0.06, d), 0.56, yy + 0.66, 0, 0, 1, 1, 1, i % 2 ? 0.72 : -0.72, 0));
  }
  lat.push(place(box(1.35, 1.05, 1.35, c), 0, H + 0.7, 0));
  lat.push(place(box(0.8, 0.5, 0.05, GLASS), 0, H + 0.82, 0.69));
  const boomL = 6.2;
  lat.push(place(box(0.22, 0.22, boomL, c), 0, H + 1.8, boomL / 2 - 0.4, 0, 1, 1, 1, -0.32, 0));
  lat.push(place(box(0.14, 0.14, boomL * 0.8, d), 0, H + 1.2, boomL * 0.4 - 0.4, 0, 1, 1, 1, -0.22, 0));
  lat.push(place(box(0.3, 0.4, 1.2, '#5a6068'), 0, H + 1.05, -1.1));
  lat.push(place(box(0.03, 3.2, 0.03, '#26292c'), 0, H - 0.05, boomL - 0.75));
  lat.push(place(box(0.24, 0.3, 0.24, '#26292c'), 0, H - 1.7, boomL - 0.75));
  placeAll(lat, x, y, z, ry);
  parts.push(...lat);
}

function forklift(parts, x, y, z, ry) {
  const p = [
    place(box(0.62, 0.34, 1, '#d7a436'), 0, 0.34, 0),
    place(box(0.56, 0.5, 0.5, '#d7a436'), 0, 0.72, -0.14),
    place(box(0.5, 0.05, 0.56, '#2c3338'), 0, 1, -0.14),
    place(box(0.5, 0.7, 0.05, '#2c3338'), 0, 0.6, 0.54),
    place(box(0.4, 0.05, 0.5, '#2c3338'), 0, 0.2, 0.82),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(place(cyl(0.14, 0.14, 0.12, 8, '#22262a'), sx * 0.34, 0.14, sz * 0.3, 0, 1, 1, 1, 0, Math.PI / 2));
  placeAll(p, x, y, z, ry);
  parts.push(...p);
}

function pier(parts, world) {
  const { pier: P } = world.port;
  const deckY = 1.7;
  const w = P.x1 - P.x0;
  const len = 30;
  const zStart = 4;
  const n = Math.floor(len / 0.34);
  for (let i = 0; i < n; i++) {
    const z = zStart - (i + 0.5) * 0.34;
    const tone = i % 5 === 0 ? '#6b5b4e' : i % 3 ? '#807062' : '#766759';
    parts.push(place(box(w + (i % 7 === 0 ? 0.12 : 0), 0.14, 0.31, tone), (P.x0 + P.x1) / 2, deckY, z));
  }
  // Snow caught against the rails on the landward half.
  for (let i = 0; i < 5; i++) {
    parts.push(place(box(0.7 + (i % 2) * 0.5, 0.05, 1.6, SNOW), P.x0 + 0.5 + (i % 2) * 2, deckY + 0.09, 1 - i * 3.3));
  }
  for (let i = 0; i <= 9; i++) {
    const z = zStart - 2 - i * 3.05;
    for (const x of [P.x0 - 0.04, P.x1 + 0.04, (P.x0 + P.x1) / 2]) {
      parts.push(place(cyl(0.16, 0.2, 5, 7, '#4d4036'), x, deckY - 2.5, z));
    }
    parts.push(place(box(w + 0.5, 0.2, 0.2, '#54463a'), (P.x0 + P.x1) / 2, deckY - 0.34, z));
    if (i % 2) {
      parts.push(place(box(0.1, 0.1, 3.2, '#54463a'), P.x0, deckY - 0.9, z - 1.5, 0, 1, 1, 1, 0.42));
      parts.push(place(box(0.1, 0.1, 3.2, '#54463a'), P.x1, deckY - 0.9, z - 1.5, 0, 1, 1, 1, -0.42));
    }
    parts.push(place(cyl(0.11, 0.13, 0.46, 7, '#2f3438'), P.x1 + 0.0, deckY + 0.26, z));
    parts.push(place(cyl(0.11, 0.13, 0.46, 7, '#2f3438'), P.x0 + 0.0, deckY + 0.26, z));
  }
  for (const z of [-3, -10, -17, -24]) lamp(parts, P.x0 + 0.12, deckY, z);
  crates(parts, -0.5, deckY + 0.07, -3.8, 2);
  crates(parts, 0.4, deckY + 0.07, -8.2, 3);
  forklift(parts, 0.1, deckY + 0.07, -11.4, 0.5);
  crates(parts, -0.45, deckY + 0.07, -15, 4);
  crates(parts, 0.5, deckY + 0.07, -19, 1);
  // Stacked crab pots waiting on the planks, and a heap of orange netting.
  const pot = (x, y, z, ry) => {
    parts.push(place(box(0.5, 0.34, 0.5, '#34434b'), x, y + 0.17, z, ry));
    parts.push(place(box(0.54, 0.04, 0.54, '#c9b17f'), x, y + 0.34, z, ry));
    parts.push(place(box(0.54, 0.04, 0.54, '#c9b17f'), x, y, z, ry));
  };
  pot(-1.05, deckY + 0.07, -6.2, 0.1);
  pot(-1.02, deckY + 0.45, -6.22, -0.1);
  pot(-1.05, deckY + 0.07, -6.85, 0.2);
  pot(1.0, deckY + 0.07, -13.4, 0);
  pot(1.04, deckY + 0.45, -13.4, 0.2);
  parts.push(place(paint(new THREE.IcosahedronGeometry(0.42, 1), '#d9682e'), -0.9, deckY + 0.18, -21.1, 0, 1, 0.5, 1.25));
  // Harbourmaster's hut and flags at the pier head.
  const hut = house({ w: 2.3, d: 1.9, h: 1.25, rh: 0.75, wall: '#e7e4dc', chimney: false, doors: 1 });
  placeAll(hut, -0.15, deckY + 0.07, -24.1, 0);
  parts.push(...hut);
  for (const [x, z, col] of [[1.25, -25.5, '#d7a436'], [0.55, -25.6, '#b5362e']]) {
    parts.push(place(cyl(0.035, 0.05, 3.1, 5, '#30373d'), x, deckY + 1.55, z));
    parts.push(place(box(0.05, 0.42, 0.7, col), x, deckY + 2.85, z + 0.38));
  }
}

function roads(parts) {
  // Packed-snow lanes: pale blue, barely there, just a border to read.
  const road = (x, z, w, d, ry = 0) => parts.push(place(box(w, 0.04, d, '#e2e9f0'), x, GROUND + 0.12, z, ry));
  road(0, 6, 1.9, 8);
  road(2, 9.4, 40, 1.8);
  road(-6, 16, 1.6, 12);
  road(9, 16, 1.6, 12);
  road(2, 22, 32, 1.6);
  road(21, 2.5, 1.5, 13);
  road(26, 3, 12, 1.2, 0.5);
}

export function buildTown(world, field) {
  const props = [];
  const trees = [];
  const add = (parts, x, z, ry, solid = null) => {
    placeAll(parts, x, GROUND - 0.1, z, ry);
    props.push(...parts);
    if (solid) {
      const hw = Math.abs(Math.cos(ry)) * solid.w * 0.5 + Math.abs(Math.sin(ry)) * solid.d * 0.5;
      const hd = Math.abs(Math.sin(ry)) * solid.w * 0.5 + Math.abs(Math.cos(ry)) * solid.d * 0.5;
      field.addBox(x - hw, x + hw, GROUND - 0.5, GROUND + solid.h, z - hd, z + hd);
    }
  };
  const smokes = [];
  const addHouse = (o, x, z, ry = 0) => {
    add(house(o), x, z, ry, { w: o.w, d: o.d, h: (o.h ?? 2) + (o.rh ?? o.w * 0.42) * 0.7 });
    if (o.chimney === false) return;
    const rh = o.rh ?? o.w * 0.42;
    const lx = o.w * 0.2;
    const lz = -o.d * 0.22;
    const cs = Math.cos(ry);
    const sn = Math.sin(ry);
    smokes.push({ x: x + lx * cs + lz * sn, y: GROUND - 0.1 + (o.h ?? 2) + rh * 0.72 + 0.7, z: z - lx * sn + lz * cs });
  };

  const RED = '#a93b34';
  const GREEN = '#3f6f66';
  const YELLOW = '#cfa248';
  const BLUE = '#37618a';
  const GREY = '#6e7f8e';
  const CREAM = '#ddd3bb';

  roads(props);
  pier(props, world);

  // The crab warehouse: ridge along X, emblem on the long seaward side.
  const warehouse = house({ w: 5.6, d: 11, h: 2.9, rh: 1.9, wall: RED, doors: 2 });
  // The long walls are local +X and -X, so one emblem faces the harbour, one the town.
  const emblem = placeAll(crabEmblem(1.35, '#f2f3f1'), 2.85, 1.5, 0, Math.PI / 2);
  const emblem2 = placeAll(crabEmblem(1.35, '#f2f3f1'), -2.85, 1.5, 0, -Math.PI / 2);
  warehouse.push(...emblem, ...emblem2);
  add(warehouse, -8.2, 4.6, Math.PI / 2, { w: 5.6, d: 11, h: 4.2 });

  addHouse({ w: 3.6, d: 5.2, h: 1.9, wall: GREEN, porch: true }, -13.4, 14, Math.PI / 2);
  addHouse({ w: 3.8, d: 5.4, h: 2, wall: GREEN }, -6.8, 13.6, 0.05);
  addHouse({ w: 2.9, d: 3.8, h: 1.6, wall: RED, chimney: false }, -15.5, 20, Math.PI / 2);
  addHouse({ w: 3.8, d: 5.4, h: 1.9, wall: GREEN, porch: true }, -7, 22.4, Math.PI / 2);
  addHouse({ w: 3.4, d: 4.4, h: 1.8, wall: YELLOW }, 3.5, 21, 0);
  addHouse({ w: 3.2, d: 4.2, h: 1.7, wall: RED, porch: true }, 11, 25.2, Math.PI / 2);
  addHouse({ w: 2.8, d: 3.4, h: 1.6, wall: GREY, chimney: false }, 3.2, 13.2, 0);
  addHouse({ w: 3.4, d: 5, h: 2.1, wall: RED }, 7.6, 3.2, 0);
  addHouse({ w: 3, d: 3.6, h: 1.9, wall: RED, chimney: false }, 11.2, 5.2, Math.PI / 2);
  addHouse({ w: 3.2, d: 4.2, h: 1.9, wall: CREAM }, 11.4, 13, 0);
  addHouse({ w: 6, d: 9.5, h: 2.6, rh: 1.7, wall: GREY, doors: 2 }, 20, 9.4, Math.PI / 2);
  addHouse({ w: 3, d: 3.8, h: 1.8, wall: BLUE, chimney: true }, 17.8, 18.4, 0);
  addHouse({ w: 2.8, d: 3.4, h: 1.7, wall: YELLOW }, 24, 17.2, Math.PI / 2);
  addHouse({ w: 2.8, d: 3.6, h: 1.5, wall: BLUE }, -22, 9, 0.02);
  addHouse({ w: 3.2, d: 4.6, h: 1.8, wall: CREAM, chimney: true }, -24, 18, Math.PI / 2);
  addHouse({ w: 3.4, d: 4.8, h: 1.8, wall: GREEN }, 28, 26, 0);
  addHouse({ w: 3, d: 4.2, h: 1.7, wall: RED }, -2, 31, 0);
  addHouse({ w: 3.2, d: 4.4, h: 1.9, wall: YELLOW }, 17, 32, Math.PI / 2);

  // Fuel tank with a red band, beside the warehouse.
  const tank = [
    place(cyl(1.25, 1.25, 2.2, 14, '#e8ebe9'), 0, 1.2, 0),
    place(cyl(1.27, 1.27, 0.46, 14, '#b5362e'), 0, 0.75, 0),
    place(cyl(1.24, 1.32, 0.16, 14, SNOW), 0, 2.38, 0),
    place(box(0.1, 2.3, 0.26, '#50565c'), 1.28, 1.2, 0),
  ];
  add(tank, -1.9, 3.3, 0, { w: 2.5, d: 2.5, h: 2.3 });
  add([place(box(2.3, 1.15, 1.25, '#37618a'), 0, 0.68, 0), place(box(2.34, 0.08, 1.3, SNOW), 0, 1.3, 0)], 2.7, 1.7, 0, { w: 2.3, d: 1.3, h: 1.2 });

  crane(props, -8.6, GROUND - 0.1, -1, 0.15);
  crates(props, -3.8, GROUND, 0.2, 2);
  crates(props, 3.1, GROUND, 4.4, 4);
  crates(props, 13.4, GROUND, 1.5, 1);
  barrel(props, -2.9, GROUND, 1.2);
  barrel(props, -3.4, GROUND, 1.8, '#3f5c66');
  barrel(props, 6.2, GROUND, 7, '#7e4c3a');

  // A boat hauled up for winter, under a tarp.
  const skiff = [
    place(box(1.1, 0.4, 3, '#2f4650'), 0, 0.3, 0),
    place(gable(1.06, 0.4, 2.8, '#dfe6ea'), 0, 0.5, 0),
  ];
  add(skiff, -2.8, 8, 0.6);

  // Glass-sided net shed east of the red houses.
  const shed = [place(box(3.2, 1.3, 1.8, '#a9c5d0'), 0, 0.75, 0), place(box(3.5, 0.14, 2.1, SNOW), 0, 1.5, 0)];
  for (let i = 0; i <= 3; i++) shed.push(place(box(0.05, 1.3, 1.84, '#f2f3f1'), -1.6 + i * 1.07, 0.75, 0));
  add(shed, 13.5, -0.8, 0, { w: 3.2, d: 1.8, h: 1.5 });

  const rack = (x, z, ry) => {
    const p = [];
    for (const s of [-1.3, 0, 1.3]) p.push(place(box(0.1, 1.5, 0.1, WOOD_D), s, 0.75, 0));
    p.push(place(box(2.8, 0.08, 0.08, WOOD), 0, 1.45, 0));
    for (let i = -3; i <= 3; i++) p.push(place(box(0.14, 0.62, 0.04, i % 2 ? '#a9b4b2' : '#c4c8be'), i * 0.36, 1.12, 0));
    placeAll(p, x, GROUND - 0.05, z, ry);
    props.push(...p);
  };
  rack(-5.5, 8.6, 0.05);
  rack(15, 26, 1.5);
  const woodpile = (x, z, ry) => {
    const p = [];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5 - row; i++) p.push(place(cyl(0.11, 0.11, 1.2, 6, i % 2 ? '#9a7a57' : '#85684a'), (i - (4 - row) / 2) * 0.23, 0.12 + row * 0.2, 0, 0, 1, 1, 1, Math.PI / 2));
    }
    p.push(place(box(1.3, 0.06, 1.26, SNOW), 0, 0.72, 0));
    placeAll(p, x, GROUND - 0.05, z, ry);
    props.push(...p);
  };
  woodpile(-9.8, 18.4, 0.1);
  woodpile(14.4, 15.8, 1.5);
  woodpile(25.4, 13, 0.4);
  const sledge = [place(box(0.7, 0.1, 1.5, '#7b6a5c'), 0, 0.28, 0), place(box(0.06, 0.2, 1.7, '#3c3230'), -0.3, 0.1, 0), place(box(0.06, 0.2, 1.7, '#3c3230'), 0.3, 0.1, 0), place(box(0.5, 0.3, 0.8, '#3f5c66'), 0, 0.48, -0.1)];
  placeAll(sledge, 0.2, GROUND - 0.05, 10.8, 0.9);
  props.push(...sledge);

  fence(props, -20, 17, -20, 25);
  fence(props, -20, 25, -11, 25);
  fence(props, 13, 20, 20, 21);
  fence(props, 26, 22, 33, 21);
  fence(props, 14, 28, 20, 28);
  pole(props, 4.5, 7.4);
  pole(props, 13, 7.4);
  pole(props, -12, 8);
  pole(props, 16, 15, 3.2, false);
  pole(props, -3, 16.5);
  pole(props, 8, 19);
  pole(props, 22, 27);

  // Lighthouse point, keeper's hut and picket fence.
  const lhY = world.heightAt(28, -7.5);
  lighthouse(props, 28, lhY - 0.1, -7.5, 1.05, '#b5362e', '#b5362e');
  field.addBox(26.7, 29.3, 0, lhY + 9, -8.8, -6.2);
  const keeper = house({ w: 2.8, d: 3.2, h: 1.5, wall: RED, chimney: true });
  placeAll(keeper, 30.2, lhY - 0.1, -2.6, Math.PI / 2);
  props.push(...keeper);
  field.addBox(28.6, 31.8, 0, lhY + 2, -4, -1.2);
  fence(props, 25, -3.4, 27.8, -1);
  fence(props, 27.8, -1, 32.6, -0.2);

  // Breakwater: a tumble of boulders ending in a small green beacon.
  const stones = (x0, z0, x1, z1, n, seed) => {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const jx = (fbm(i * 0.7, seed, 77, 2) - 0.5) * 3.6;
      const jz = (fbm(seed, i * 0.7, 78, 2) - 0.5) * 3.6;
      const r = 0.55 + ((i * 37 + seed) % 10) * 0.075;
      const x = x0 + (x1 - x0) * t + jx;
      const z = z0 + (z1 - z0) * t + jz;
      props.push(place(rock(r, i + seed), x, 0.7 + ((i * 13) % 5) * 0.14, z, i * 1.7));
      field.addBox(x - r, x + r, 0, 1.4, z - r, z + r, 0.7);
    }
  };
  stones(-17, 6, -15, -3, 34, 5);
  stones(-15, -3, -12, -12, 34, 9);
  lighthouse(props, -12, 1.2, -12.8, 0.42, '#2e6a5f', '#2e6a5f');
  props.push(place(cyl(1.15, 1.45, 1, 10, '#7f8a96'), -12, 0.8, -12.8));
  field.addBox(-13, -11, 0, 5.5, -13.8, -11.8);

  // Trees placed to frame the town, then the wild coast.
  const treeAt = (x, z, s, seed) => {
    const y = world.heightAt(x, z);
    if (y < 0.5) return;
    trees.push(...conifer(x, y - 0.1, z, s, seed));
    const r = 0.8 * s;
    field.addBox(x - r, x + r, y, y + 3.1 * s, z - r, z + r, 0.45);
  };
  const stand = [
    [-21, 2, 1.25], [-23.5, 4, 1.45], [-20, 5.5, 1.05], [-26, 1, 1.3], [-27.5, 7, 1.4], [-18.5, 11, 1.05], [-11, 19, 1],
    [-18, 15, 1.15], [-27, 13, 1.35], [-10.5, 27, 1.05], [-19, 29, 1.35], [-13, 31, 1.15], [0, 27.5, 1], [6, 29.5, 1.1],
    [-0.5, 18.2, 0.85], [7, 11, 0.8], [14.4, 9.8, 0.85], [15, 22.6, 0.95], [23, 21.6, 0.95], [31, 16, 1.2], [33, 7, 1.2],
    [34.4, 10.5, 1.05], [36, 2, 1.35], [31.5, 3.3, 1], [24.4, -2.5, 0.85], [33, -4, 1.05], [35, -8, 1.25], [20, 36, 1.2], [8, 36, 1.3],
    [-5, 37, 1.3], [-24, 26, 1.2], [-30, 21, 1.4],
  ];
  stand.forEach(([x, z, s], i) => treeAt(x, z, s, i));

  // Boulders scattered through town margins, like the reference's grey outcrops.
  const out = [
    [34, 22, 1.5], [36, 24, 1.1], [37, 19, 1.3], [-31, 29, 1.7], [-34, 25, 1.3], [-29, 34, 1.3], [12, 38, 1.5], [15, 40, 1.1], [-8, 41, 1.6], [37, -2, 1.4], [38.5, -6, 1.7], [34, -11, 1.3], [29.5, -13, 1], [24, -10.4, 0.9], [-25, -4, 1.2], [-28, -1, 1.5], [-22, -1, 0.9], [20, 1.8, 0.7], [-16.5, 12, 0.7], [1, 34, 0.9], [-31, 6, 1.4],
  ];
  out.forEach(([x, z, r], i) => {
    const y = world.heightAt(x, z);
    if (y < 0.2) return;
    props.push(place(rock(r, i + 30), x, y + r * 0.2, z, i));
    field.addBox(x - r, x + r, y, y + r, z - r, z + r, 0.8);
  });

  // The wild coast: forest stands and rocks wherever the noise allows.
  const half = 500; // trees and rocks carry on past the chart's edge
  const step = 7;
  let wildTrees = 0;
  let wildRocks = 0;
  let cabins = 0;
  const h1 = (a, b) => {
    const v = Math.sin(a * 12.9898 + b * 78.233 + world.seed * 0.0001) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let gz = -half; gz < half; gz += step) {
    for (let gx = -half; gx < half; gx += step) {
      const x = gx + h1(gx, gz) * step;
      const z = gz + h1(gz, gx) * step;
      if (x > TOWN.x0 - 2 && x < TOWN.x1 + 2 && z > TOWN.z0 - 2 && z < TOWN.z1 + 2) continue;
      const y = world.heightAt(x, z);
      if (y < 0.8) continue;
      const slope = Math.abs(world.heightAt(x + 2, z) - world.heightAt(x - 2, z)) + Math.abs(world.heightAt(x, z + 2) - world.heightAt(x, z - 2));
      const roll = h1(x, z);
      const woods = fbm(x * 0.03, z * 0.03, world.seed + 51, 2);
      if (woods > 0.55 && slope < 3.2 && y < 18 && wildTrees < 2200) {
        const c = 1 + Math.floor(roll * 3);
        for (let i = 0; i < c; i++) {
          treeAt(x + (h1(i, x) - 0.5) * 5, z + (h1(z, i) - 0.5) * 5, 0.95 + h1(x, i) * 0.65, (i + wildTrees) % 4);
          wildTrees++;
        }
      } else if ((slope > 3.4 || roll > 0.92) && wildRocks < 1000) {
        const r = 0.8 + roll * 1.3 + Math.min(1, slope * 0.1);
        props.push(place(rock(r, wildRocks), x, y + r * 0.1, z, roll * 6));
        field.addBox(x - r, x + r, y, y + r, z - r, z + r, 0.75);
        wildRocks++;
      } else if (roll < 0.0035 && slope < 1 && cabins < 24) {
        const parts = house({ w: 2.8, d: 3.6, h: 1.5, wall: [RED, GREEN, YELLOW, BLUE, GREY][cabins % 5], windows: true });
        placeAll(parts, x, y - 0.1, z, cabins % 2 ? Math.PI / 2 : 0);
        props.push(...parts);
        field.addBox(x - 2, x + 2, y, y + 2.5, z - 2, z + 2);
        cabins++;
      }
    }
  }

  // Dark outcrops on the skerries.
  for (const f of world.features) {
    if (f.kind !== 'skerry') continue;
    for (let i = 0; i < 6; i++) {
      const a = h1(f.x, i) * 6.28;
      const d = h1(i, f.z) * f.r * 0.8;
      const x = f.x + Math.cos(a) * d;
      const z = f.z + Math.sin(a) * d;
      const y = world.heightAt(x, z);
      if (y < 0.3) continue;
      const r = 1 + h1(x, z) * 1.3;
      props.push(place(rock(r, i + f.s % 100), x, y, z, a));
    }
  }

  return { props: mergeChunks(props), trees: mergeChunks(trees), smokes };
}

export function relightTrees(geos, field) {
  for (const g of geos) relightOne(g, field);
}

function relightOne(geo, field) {
  // Mix each facet with the voxel normal so a stand of trees lights as one mass.
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const n = new THREE.Vector3();
  const f = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    field.normalAt(pos.getX(i), pos.getY(i), pos.getZ(i), n, 2);
    for (let j = 0; j < 3; j++) {
      f.fromBufferAttribute(nor, i + j).lerp(n, 0.55).normalize();
      nor.setXYZ(i + j, f.x, f.y, f.z);
    }
  }
  nor.needsUpdate = true;
}
