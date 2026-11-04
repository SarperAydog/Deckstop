// The mainland: one big faceted snowfield. Almost no colour lives inside an area;
// the interest is at the borders, where snow breaks over grey rock with a crisp edge
// and a one-pixel shadow underneath (a ddy trick straight from Bad North's shaders).
import * as THREE from 'three';
import { fbm } from '../sim/world.js';
import { stylize } from './mist.js';
import { waveHeight, waveState } from './water.js';

const hash = (i, j) => {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

const SNOW = new THREE.Color('#f1f4f7');
const ICE = new THREE.Color('#e8f3f6');

export function terrainMaterial() {
  return stylize(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key: 'terrain',
    uniforms: { uRock: { value: new THREE.Color('#8794a6') } },
    vert: 'attribute float aSnow; varying float vSnow;',
    vertBody: 'vSnow = aSnow;',
    frag: 'varying float vSnow; uniform vec3 uRock;',
    fragColor: /* glsl */ `
      float fw = max(fwidth(vSnow), 0.001);
      float sn = smoothstep(0.5 - fw * 0.7, 0.5 + fw * 0.7, vSnow);
      float soft = smoothstep(0.5 - fw * 1.6, 0.5 + fw * 1.6, vSnow);
      diffuseColor.rgb = mix(uRock, diffuseColor.rgb, sn);
      // A pixel just below the snow's edge falls into its little shadow.
      diffuseColor.rgb *= 1.0 - clamp(dFdy(soft) * 1.6, 0.0, 0.42);
    `,
  });
}

export function buildTerrainGeometry(world) {
  const { nv, px, py, pz, surf } = world.mesh;
  const seed = world.seed;

  // How snowy each vertex is: steep or wind-scoured ground turns to rock.
  const snow = new Float32Array(nv * nv);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nv; i++) {
      const k = j * nv + i;
      if (surf[k] === 2) {
        snow[k] = 1;
        continue;
      }
      if (surf[k] === 1) {
        snow[k] = py[k] > 3.5 && hash(i, j) > 0.45 ? 1 : 0;
        continue;
      }
      let slope = 0;
      if (i > 0 && j > 0 && i < nv - 1 && j < nv - 1) {
        slope = Math.max(
          Math.abs(py[k + 1] - py[k - 1]),
          Math.abs(py[k + nv] - py[k - nv]),
          Math.abs(py[k + 1 + nv] - py[k - 1 - nv]),
        ) / 6;
      }
      const scour = fbm(px[k] * 0.06, pz[k] * 0.06, seed + 41, 2);
      snow[k] = Math.min(1, Math.max(0, 1.25 - slope * 1.25 - Math.max(0, scour - 0.62) * 3));
    }
  }

  const pos = [];
  const col = [];
  const att = [];
  const tri = (a, b, c, i, j, v) => {
    pos.push(px[a], py[a], pz[a], px[b], py[b], pz[b], px[c], py[c], pz[c]);
    att.push(snow[a], snow[b], snow[c]);
    // The faintest tone shift per facet: enough to read as planes, never as noise.
    const t = 0.975 + hash(i + v * 7, j) * 0.025;
    const base = surf[a] === 2 ? ICE : SNOW;
    for (let n = 0; n < 3; n++) col.push(base.r * t, base.g * t, base.b * t);
  };
  for (let j = 0; j < nv - 1; j++) {
    for (let i = 0; i < nv - 1; i++) {
      const a = j * nv + i;
      const b = a + 1;
      const d = a + nv;
      const e = d + 1;
      if (Math.max(py[a], py[b], py[d], py[e]) < -0.01) continue;
      if ((i + j) % 2) {
        tri(a, d, b, i, j, 0);
        tri(b, d, e, i, j, 1);
      } else {
        tri(a, d, e, i, j, 0);
        tri(a, e, b, i, j, 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSnow', new THREE.Float32BufferAttribute(att, 1));
  g.computeVertexNormals();
  return g;
}

// Loose floes small enough for the ship to shoulder aside.
export class Floes {
  constructor(scene, world, material, crackedMaterial, onBreak) {
    this.world = world;
    this.onBreak = onBreak;
    this.time = 0;
    const shape = (seed, sides) => {
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        pts.push([Math.cos(a) * (0.72 + hash(seed, i) * 0.5), -Math.sin(a) * (0.72 + hash(i, seed) * 0.5)]);
      }
      return pts;
    };
    const pos = [];
    const col = [];
    const white = new THREE.Color('#f6f9fa');
    const shade = new THREE.Color('#dbe9ee');
    const skirt = new THREE.Color('#79c0c2');
    const push = (p, c) => {
      pos.push(...p);
      col.push(c.r, c.g, c.b);
    };
    const pts = shape(3, 8);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % n];
      // Pale submerged skirt, side wall, then a very slightly domed top.
      push([ax * 1.2, 0.015, az * 1.2], skirt);
      push([bx * 1.2, 0.015, bz * 1.2], skirt);
      push([0, 0.015, 0], skirt);
      push([ax, 0.02, az], shade);
      push([bx, 0.02, bz], shade);
      push([bx * 0.97, 0.16, bz * 0.97], shade);
      push([ax, 0.02, az], shade);
      push([bx * 0.97, 0.16, bz * 0.97], shade);
      push([ax * 0.97, 0.16, az * 0.97], shade);
      push([ax * 0.97, 0.16, az * 0.97], white);
      push([bx * 0.97, 0.16, bz * 0.97], white);
      push([0.1, 0.22, -0.08], white);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();

    this.items = [];
    let rs = world.seed % 233280;
    const rnd = () => {
      rs = (rs * 9301 + 49297) % 233280;
      return rs / 233280;
    };
    const b = world.bounds;
    for (let i = 0; i < 4200 && this.items.length < 900; i++) {
      const x = b.x0 + rnd() * (b.x1 - b.x0);
      const z = b.z0 + rnd() * (b.z1 - b.z0);
      const big = rnd();
      const r = big > 0.9 ? 2.4 + rnd() * 2.6 : 0.5 + rnd() * 1.3;
      const d = world.shoreDistance(x, z);
      if (d < r + 1.5) continue;
      if (Math.abs(x - world.port.x) < 9 + r && z > world.port.pier.z0 - 16 && z < 0) continue;
      this.items.push({ x, z, r, ry: rnd() * 6.28, sx: 0.8 + rnd() * 0.5, alive: true, grow: 1, respawnAt: 0, homeX: x, homeZ: z });
    }
    this.mesh = new THREE.InstancedMesh(geo, material, this.items.length);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy = new THREE.Object3D();
    this.items.forEach((_, i) => this.write(i));
    scene.add(this.mesh);

    // Kept for cracking: the outline every floe is drawn from, and its colours.
    this.outline = pts;
    this.tones = { white, shade, skirt, inner: new THREE.Color('#c4dfe7') };
    this.crackedMaterial = crackedMaterial;
    this.scene = scene;
    this.broken = [];
    this.maxBroken = 40;
  }

  write(i) {
    const it = this.items[i];
    const d = this.dummy;
    d.position.set(it.x, it.y ?? 0, it.z);
    d.rotation.y = it.ry;
    const g = it.alive ? it.grow : 0;
    d.scale.set(it.r * it.sx * g + 1e-4, (1 + it.r * 0.12) * g + 1e-4, it.r * g + 1e-4);
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
  }

  // Cuts the floe's outline with a jittered grid of Voronoi cells, so cracks run
  // irregularly across it. Bigger floes break into more, similar-sized pieces.
  shatterCells(r, ry, sx) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    // The outline in world units, relative to the floe's centre.
    const shape = this.outline.map(([x, z]) => {
      const lx = x * 0.97 * r * sx;
      const lz = z * 0.97 * r;
      return [lx * c + lz * s, -lx * s + lz * c];
    });
    const cell = 1.15 + Math.random() * 0.35;
    const reach = r * 1.35;
    const seeds = [];
    for (let gz = -reach; gz <= reach; gz += cell) {
      for (let gx = -reach; gx <= reach; gx += cell) {
        const a = gx + (Math.random() - 0.5) * cell * 0.85;
        const b = gz + (Math.random() - 0.5) * cell * 0.85;
        let inside = false;
        for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
          const [xi, zi] = shape[i];
          const [xj, zj] = shape[j];
          if (zi > b !== zj > b && a < ((xj - xi) * (b - zi)) / (zj - zi) + xi) inside = !inside;
        }
        if (inside) seeds.push([a, b]);
      }
    }
    while (seeds.length > 26) seeds.splice(Math.floor(Math.random() * seeds.length), 1);
    if (seeds.length < 3) {
      for (let k = seeds.length; k < 3; k++) {
        const a = (k / 3) * 6.283 + Math.random();
        seeds.push([Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45]);
      }
    }
    const clip = (poly, ax, az, bx, bz) => {
      // Keeps the side of the bisector nearer to a.
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const nx = bx - ax;
      const nz = bz - az;
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const dp = (p[0] - mx) * nx + (p[1] - mz) * nz;
        const dq = (q[0] - mx) * nx + (q[1] - mz) * nz;
        if (dp <= 0) out.push(p);
        if (dp < 0 !== dq < 0) {
          const k = dp / (dp - dq);
          out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
        }
      }
      return out;
    };
    const cells = [];
    seeds.forEach((sd, i) => {
      let poly = shape;
      seeds.forEach((other, j) => {
        if (i !== j && poly.length) poly = clip(poly, sd[0], sd[1], other[0], other[1]);
      });
      if (poly.length >= 3) cells.push(poly);
    });
    return cells;
  }

  // The floe stays where it is and splits along those cracks. The pieces ease apart,
  // keep floating for a few seconds, then one by one take on water and go under.
  crack(it, i, cx, cz, d) {
    it.alive = false;
    it.respawnAt = this.time + 45 + Math.random() * 75;
    this.write(i);
    if (this.broken.length >= this.maxBroken) this.dropBroken(0);
    const awayX = d > 1e-3 ? cx / d : 0;
    const awayZ = d > 1e-3 ? cz / d : 0;
    const height = 0.16 * (1 + it.r * 0.12);
    const pos = [];
    const col = [];
    const pieces = [];
    const { white, shade, skirt, inner } = this.tones;
    const push = (x, y, z, c) => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
    };
    for (const poly of this.shatterCells(it.r, it.ry, it.sx)) {
      const mx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
      const mz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      const start = pos.length;
      const dome = height * (1 + Math.random() * 0.25);
      for (let v = 0; v < poly.length; v++) {
        const [ax, az] = poly[v];
        const [bx, bz] = poly[(v + 1) % poly.length];
        // Pale submerged halo, raw broken side, then the top.
        push(mx + (bx - mx) * 1.12, 0.015, mz + (bz - mz) * 1.12, skirt);
        push(mx + (ax - mx) * 1.12, 0.015, mz + (az - mz) * 1.12, skirt);
        push(mx, 0.015, mz, skirt);
        push(ax, 0.02, az, inner);
        push(bx, height, bz, shade);
        push(bx, 0.02, bz, shade);
        push(ax, 0.02, az, inner);
        push(ax, height, az, inner);
        push(bx, height, bz, shade);
        push(bx, height, bz, white);
        push(ax, height, az, white);
        push(mx, dome, mz, white);
      }
      pieces.push({
        mx,
        mz,
        start: start / 3,
        end: pos.length / 3,
        ox: 0,
        oz: 0,
        vx: awayX * 0.14 + (Math.random() - 0.5) * 0.06,
        vz: awayZ * 0.14 + (Math.random() - 0.5) * 0.06,
        spread: 0.1 + Math.random() * 0.12, // how far from the centre the web opens
        rot: 0,
        spin: (Math.random() - 0.5) * 0.14,
        y: 0,
        fall: 0,
        tilt: 0,
        tiltX: Math.random() - 0.5,
        tiltZ: Math.random() - 0.5,
        float: 3 + Math.random() * 5,
        wob: Math.random() * 6.28,
      });
    }
    const geo = new THREE.BufferGeometry();
    const rest = new Float32Array(pos);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geo, this.crackedMaterial);
    mesh.frustumCulled = false;
    mesh.position.set(it.x, 0, it.z);
    this.scene.add(mesh);
    this.broken.push({ mesh, rest, x: it.x, z: it.z, r: it.r, age: 0, pieces });
    this.onBreak?.(it.x, it.z, it.r);
  }

  dropBroken(b) {
    const fl = this.broken[b];
    this.scene.remove(fl.mesh);
    fl.mesh.geometry.dispose();
    this.broken.splice(b, 1);
  }

  // The hull is treated as a line along its length. Anything it meets at speed
  // shatters; at a crawl the bow only shoulders the floe aside.
  update(x, z, heading, speed, length, beam, dt, time = 0) {
    this.time += dt;
    let dirty = false;
    const ax = Math.sin(heading);
    const az = Math.cos(heading);
    const half = length * 0.5;
    const pace = Math.abs(speed);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.alive) {
        // Back on station once the ship has gone, growing out of the water.
        if (this.time >= it.respawnAt && Math.hypot(it.homeX - x, it.homeZ - z) > 45) {
          it.alive = true;
          it.grow = 0.02;
          it.x = it.homeX;
          it.z = it.homeZ;
          this.write(i);
          dirty = true;
        }
        continue;
      }
      // Floes near the ship ride the swell. Those further off are out of sight.
      if ((waveState.geo > 0.001 || it.y) && Math.abs(it.x - x) < 90 && Math.abs(it.z - z) < 90) {
        it.y = waveHeight(this.world, it.x, it.z, time, waveState.geo);
        this.write(i);
        dirty = true;
      }
      if (it.grow < 1) {
        it.grow = Math.min(1, it.grow + dt * 0.35);
        this.write(i);
        dirty = true;
      }
      const dx = it.x - x;
      const dz = it.z - z;
      const lim = half + it.r + beam;
      if (dx > lim || dx < -lim || dz > lim || dz < -lim) continue;
      const t = Math.max(-half, Math.min(half, dx * ax + dz * az));
      const cx = dx - ax * t;
      const cz = dz - az * t;
      const d = Math.hypot(cx, cz);
      const touch = beam * 0.5 + it.r * 0.72;
      if (d >= touch) continue;
      if (pace >= 0.7) {
        this.crack(it, i, cx, cz, d);
      } else if (d > 1e-3) {
        const push = (touch - d) * dt * 2;
        it.x += (cx / d) * push;
        it.z += (cz / d) * push;
        it.ry += dt * 0.15;
        this.write(i);
      }
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;

    this.updateBroken(x, z, ax, az, half, beam, pace, dt, time);
  }

  updateBroken(x, z, ax, az, half, beam, pace, dt, time) {
    for (let b = this.broken.length - 1; b >= 0; b--) {
      const fl = this.broken[b];
      fl.age += dt;
      fl.mesh.position.y = waveHeight(this.world, fl.x, fl.z, time, waveState.geo);
      const out = fl.mesh.geometry.attributes.position;
      let afloat = false;
      const widen = 1 - Math.exp(-fl.age * 0.55);
      for (const p of fl.pieces) {
        if (p.y < -0.7) {
          if (!p.gone) {
            p.gone = true;
            for (let v = p.start; v < p.end; v++) out.setXYZ(v, 0, -5, 0);
          }
          continue;
        }
        afloat = true;
        // A hull still passing shoulders the pieces aside.
        const wx = fl.x + p.mx + p.ox - x;
        const wz = fl.z + p.mz + p.oz - z;
        const along = Math.max(-half, Math.min(half, wx * ax + wz * az));
        const hx = wx - ax * along;
        const hz = wz - az * along;
        const hd = Math.hypot(hx, hz);
        const reach = beam * 0.5 + 0.5;
        if (hd < reach && hd > 1e-3) {
          const shove = (reach - hd) * (0.6 + pace * 0.22) * dt * 1.6;
          p.vx += (hx / hd) * shove;
          p.vz += (hz / hd) * shove;
        }
        p.ox += p.vx * dt;
        p.oz += p.vz * dt;
        p.vx *= 1 - dt * 0.5;
        p.vz *= 1 - dt * 0.5;
        p.rot += p.spin * dt;
        p.float -= dt;
        if (p.float <= 0) {
          p.fall += dt * 0.09;
          p.y -= p.fall * dt * 6;
          p.tilt = Math.min(0.5, p.tilt + dt * 0.14);
        }
        const bob = p.float > 0 ? Math.sin(fl.age * 1.5 + p.wob) * 0.012 : 0;
        const shiftX = p.mx * p.spread * widen + p.ox;
        const shiftZ = p.mz * p.spread * widen + p.oz;
        const c = Math.cos(p.rot);
        const s = Math.sin(p.rot);
        for (let v = p.start; v < p.end; v++) {
          const rx = fl.rest[v * 3] - p.mx;
          const ry = fl.rest[v * 3 + 1];
          const rz = fl.rest[v * 3 + 2] - p.mz;
          out.setXYZ(
            v,
            p.mx + rx * c + rz * s + shiftX,
            ry + p.y + bob + (rx * p.tiltX + rz * p.tiltZ) * p.tilt,
            p.mz - rx * s + rz * c + shiftZ,
          );
        }
      }
      out.needsUpdate = true;
      if (!afloat) this.dropBroken(b);
    }
  }
}
