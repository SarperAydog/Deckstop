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

// How far the pale ice shows around a floe, in world units. The same for every size.
const HALO_WIDTH = 0.18;

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
// Pushes every edge of a convex polygon outward by the same distance.
function growPolygon(poly, by) {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % n];
    area += ax * bz - bx * az;
  }
  const side = area >= 0 ? 1 : -1;
  const normal = (a, b) => {
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l = Math.hypot(ex, ez) || 1;
    return [(ez / l) * side, (-ex / l) * side];
  };
  return poly.map((p, i) => {
    const n0 = normal(poly[(i + n - 1) % n], p);
    const n1 = normal(p, poly[(i + 1) % n]);
    const mx = n0[0] + n1[0];
    const mz = n0[1] + n1[1];
    const l = Math.hypot(mx, mz) || 1;
    // The corner moves far enough that both edges keep their full width.
    const stretch = Math.min(2.2, 1 / Math.max(0.2, ((mx / l) * n1[0] + (mz / l) * n1[1])));
    return [p[0] + (mx / l) * by * stretch, p[1] + (mz / l) * by * stretch];
  });
}

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
      // Side wall, then a very slightly domed top.
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
      const sx = 0.8 + rnd() * 0.5;
      const rad = r * 0.86 * (sx + 1) * 0.5;
      if (this.items.some((o) => Math.hypot(o.x - x, o.z - z) < o.rad + rad + 0.3)) continue;
      this.items.push({ x, z, r, rad, mass: rad * rad, vx: 0, vz: 0, ry: rnd() * 6.28, sx, alive: true, grow: 1, respawnAt: 0, homeX: x, homeZ: z });
    }
    this.mesh = new THREE.InstancedMesh(geo, material, this.items.length);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy = new THREE.Object3D();

    // The pale ice seen under the surface is its own layer: painted straight onto the
    // water, right after it and before everything else. Waves can never cover it, and
    // it does not depend on how the ice above it is broken up.
    // Each rim vertex carries its outward direction: the shader adds a fixed width
    // along it after scaling, so a huge floe gets the same thin rim as a tiny one.
    const skirtPos = [];
    const skirtCol = [];
    const skirtOut = [];
    const outward = ([x, z]) => {
      const l = Math.hypot(x, z) || 1;
      return [x / l, z / l];
    };
    for (let i = 0; i < n; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[(i + 1) % n];
      skirtPos.push(ax, 0, az, bx, 0, bz, 0, 0, 0);
      skirtOut.push(...outward(pts[i]), ...outward(pts[(i + 1) % n]), 0, 0);
      for (let v = 0; v < 3; v++) skirtCol.push(skirt.r, skirt.g, skirt.b);
    }
    this.skirtGeo = new THREE.BufferGeometry();
    this.skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtPos, 3));
    this.skirtGeo.setAttribute('color', new THREE.Float32BufferAttribute(skirtCol, 3));
    this.skirtGeo.setAttribute('aOut', new THREE.Float32BufferAttribute(skirtOut, 2));
    this.skirtGeo.computeVertexNormals();
    this.skirts = new THREE.InstancedMesh(
      this.skirtGeo,
      stylize(new THREE.MeshLambertMaterial({ vertexColors: true, depthTest: false, depthWrite: false }), {
        key: 'floeHalo',
        uniforms: { uHaloWidth: { value: HALO_WIDTH } },
        vert: 'attribute vec2 aOut; uniform float uHaloWidth;',
        vertBegin: /* glsl */ `
          {
            // Undo the instance's scale so the width stays in world units. A floe
            // still growing back, or gone, takes its rim with it.
            vec2 sc = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz));
            transformed.xz += aOut * uHaloWidth * smoothstep(0.0, 0.3, sc.x) / max(sc, vec2(0.001));
          }
        `,
      }),
      this.items.length,
    );
    this.skirts.frustumCulled = false;
    this.skirts.renderOrder = -0.5; // the water is -1, everything else 0
    this.skirts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.items.forEach((_, i) => this.write(i));
    scene.add(this.mesh, this.skirts);

    // Kept for cracking: the outline every floe is drawn from, and its colours.
    this.outline = pts;
    this.tones = { white, shade, skirt, inner: new THREE.Color('#c4dfe7') };
    this.crackedMaterial = crackedMaterial;
    this.scene = scene;
    this.broken = [];
    this.maxBroken = 14;
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
    this.skirts.setMatrixAt(i, d.matrix);
  }

  // Cuts the floe's outline with a jittered grid of Voronoi cells, so cracks run
  // irregularly across it. Bigger floes break into more, similar-sized pieces.
  shatterCells(r, ry, sx) {
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    // The outline in world units, relative to the floe's centre.
    const turned = (k) =>
      this.outline.map(([x, z]) => {
        const lx = x * k * r * sx;
        const lz = z * k * r;
        return [lx * c + lz * s, -lx * s + lz * c];
      });
    const shape = turned(0.97);
    const baseShape = turned(1);
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
      let base = baseShape;
      seeds.forEach((other, j) => {
        if (i === j) return;
        if (poly.length) poly = clip(poly, sd[0], sd[1], other[0], other[1]);
        if (base.length) base = clip(base, sd[0], sd[1], other[0], other[1]);
      });
      if (poly.length >= 3) cells.push({ poly, halo: growPolygon(base.length >= 3 ? base : poly, HALO_WIDTH) });
    });
    return cells;
  }

  // The floe stays where it is and splits along those cracks. The pieces ease apart,
  // keep floating for a few seconds, then one by one take on water and go under.
  crack(it, i, cx, cz, d) {
    it.alive = false;
    it.respawnAt = this.time + 70 + Math.random() * 80;
    this.write(i);
    if (this.broken.length >= this.maxBroken) this.dropBroken(0);
    const awayX = d > 1e-3 ? cx / d : 0;
    const awayZ = d > 1e-3 ? cz / d : 0;
    const height = 0.16 * (1 + it.r * 0.12);
    const pos = [];
    const col = [];
    const pieces = [];
    const { white, shade, inner } = this.tones;
    const push = (x, y, z, c) => {
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b, 1);
    };
    const haloPos = [];
    const haloCol = [];
    const { skirt } = this.tones;
    for (const { poly, halo } of this.shatterCells(it.r, it.ry, it.sx)) {
      const mx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
      const mz = poly.reduce((a, p) => a + p[1], 0) / poly.length;
      const start = pos.length;
      const dome = height * (1 + Math.random() * 0.25);
      for (let v = 0; v < poly.length; v++) {
        const [ax, az] = poly[v];
        const [bx, bz] = poly[(v + 1) % poly.length];
        // Raw broken side, then the top.
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
      // This piece's share of the pale ice under the water travels with it.
      const haloStart = haloPos.length / 3;
      if (halo.length >= 3) {
        const hx = halo.reduce((a, p) => a + p[0], 0) / halo.length;
        const hz = halo.reduce((a, p) => a + p[1], 0) / halo.length;
        for (let v = 0; v < halo.length; v++) {
          const [ax, az] = halo[v];
          const [bx, bz] = halo[(v + 1) % halo.length];
          haloPos.push(ax, 0, az, bx, 0, bz, hx, 0, hz);
          for (let k = 0; k < 3; k++) haloCol.push(skirt.r, skirt.g, skirt.b, 1);
        }
      }
      let area = 0;
      for (let v = 0; v < poly.length; v++) {
        const [ax, az] = poly[v];
        const [bx, bz] = poly[(v + 1) % poly.length];
        area += ax * bz - bx * az;
      }
      const rad = Math.sqrt(Math.abs(area) / 2 / Math.PI) * 0.82;
      const outLen = Math.hypot(mx, mz) || 1;
      const ease = 0.05 + Math.random() * 0.1;
      pieces.push({
        mx,
        mz,
        start: start / 3,
        end: pos.length / 3,
        haloStart,
        haloEnd: haloPos.length / 3,
        x: it.x + mx,
        z: it.z + mz,
        rad,
        mass: rad * rad,
        vx: (mx / outLen) * ease + awayX * 0.1,
        vz: (mz / outLen) * ease + awayZ * 0.1,
        rot: 0,
        spin: (Math.random() - 0.5) * 0.14,
        y: 0,
        fade: 0,
        fadeTime: 11 + Math.random() * 7,
        tilt: 0,
        tiltX: Math.random() - 0.5,
        tiltZ: Math.random() - 0.5,
        float: 12 + Math.random() * 18,
        wob: Math.random() * 6.28,
      });
    }
    const geo = new THREE.BufferGeometry();
    const rest = new Float32Array(pos);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.computeVertexNormals();
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geo.attributes.color.setUsage(THREE.DynamicDrawUsage);
    const mesh = new THREE.Mesh(geo, this.crackedMaterial);
    mesh.frustumCulled = false;
    mesh.position.set(it.x, 0, it.z);
    this.scene.add(mesh);
    // Still its own layer on the water, so waves cannot cover it, but moved piece by
    // piece along with the ice.
    const haloGeo = new THREE.BufferGeometry();
    const haloRest = new Float32Array(haloPos);
    haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(haloPos), 3));
    haloGeo.setAttribute('color', new THREE.Float32BufferAttribute(haloCol, 4));
    haloGeo.computeVertexNormals();
    haloGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    haloGeo.attributes.color.setUsage(THREE.DynamicDrawUsage);
    this.haloMaterial ??= stylize(
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    const halo = new THREE.Mesh(haloGeo, this.haloMaterial);
    halo.frustumCulled = false;
    halo.renderOrder = -0.5;
    halo.position.set(it.x, it.y ?? 0, it.z);
    this.scene.add(halo);
    this.broken.push({ mesh, halo, haloRest, rest, x: it.x, z: it.z, r: it.r, age: 0, pieces });
    this.onBreak?.(it.x, it.z, it.r);
  }

  dropBroken(b) {
    const fl = this.broken[b];
    this.scene.remove(fl.mesh, fl.halo);
    fl.mesh.geometry.dispose();
    fl.halo.geometry.dispose();
    this.broken.splice(b, 1);
  }

  // The hull is a line along its length. A floe met by the bow at speed shatters. One
  // met by the flank, or just passed nearby, is shouldered aside and carried off by
  // the wave the hull pushes in front of it, and goes on drifting after.
  hullContact(body, x, z, ax, az, half, beam, pace, dt, forward) {
    const dx = body.x - x;
    const dz = body.z - z;
    const reachWave = 1 + pace * 0.55;
    const lim = half + body.rad + beam + reachWave;
    if (dx > lim || dx < -lim || dz > lim || dz < -lim) return null;
    const t = Math.max(-half, Math.min(half, dx * ax + dz * az));
    const cx = dx - ax * t;
    const cz = dz - az * t;
    const d = Math.hypot(cx, cz);
    const touch = beam * 0.5 + body.rad;
    if (d > touch + reachWave || d < 1e-3) return null;
    const nx = cx / d;
    const nz = cz / d;
    const atBow = forward ? t > half * 0.45 : t < -half * 0.45;
    if (pace > 0.3) {
      const push = (pace * 0.42 * (1 - Math.max(0, d - touch) / reachWave) * dt) / Math.sqrt(Math.max(1, body.mass));
      body.vx += nx * push;
      body.vz += nz * push;
    }
    if (d < touch) {
      if (body.grow !== undefined && atBow && pace >= 1) return { crack: true, cx, cz, d };
      body.x += nx * (touch - d);
      body.z += nz * (touch - d);
      const into = body.vx * nx + body.vz * nz;
      const want = 0.06 + pace * 0.13;
      if (into < want) {
        body.vx += nx * (want - into);
        body.vz += nz * (want - into);
      }
    }
    return null;
  }

  update(x, z, heading, speed, length, beam, dt, time = 0) {
    this.time += dt;
    let dirty = false;
    const ax = Math.sin(heading);
    const az = Math.cos(heading);
    const half = length * 0.5;
    const pace = Math.abs(speed);
    const forward = speed >= 0;
    const bodies = [];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.index = i;
      if (!it.alive) {
        // Back on station once the ship has gone, growing out of the water.
        if (this.time >= it.respawnAt && Math.hypot(it.homeX - x, it.homeZ - z) > 45) {
          it.alive = true;
          it.grow = 0.02;
          it.x = it.homeX;
          it.z = it.homeZ;
          it.vx = 0;
          it.vz = 0;
          this.write(i);
          dirty = true;
        }
        continue;
      }
      const near = Math.abs(it.x - x) < 90 && Math.abs(it.z - z) < 90;
      // Floes near the ship ride the swell. Those further off are out of sight.
      if (near && (waveState.geo > 0.001 || it.y)) {
        it.y = waveHeight(this.world, it.x, it.z, time, waveState.geo);
        this.write(i);
        dirty = true;
      }
      if (it.grow < 1) {
        it.grow = Math.min(1, it.grow + dt * 0.35);
        this.write(i);
        dirty = true;
      }
      if (near || it.vx || it.vz) {
        const hit = this.hullContact(it, x, z, ax, az, half, beam, pace, dt, forward);
        if (hit?.crack) {
          this.crack(it, i, hit.cx, hit.cz, hit.d);
          dirty = true;
          continue;
        }
        bodies.push(it);
      }
    }
    for (const fl of this.broken) {
      for (const p of fl.pieces) {
        if (p.fade >= 1) continue;
        this.hullContact(p, x, z, ax, az, half, beam, pace, dt, forward);
        bodies.push(p);
      }
    }

    // Ice is solid to ice: overlapping bodies part, and pass on some of their motion.
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const reach = a.rad + b.rad;
        const dx = b.x - a.x;
        if (dx > reach || dx < -reach) continue;
        const dz = b.z - a.z;
        if (dz > reach || dz < -reach) continue;
        const d = Math.hypot(dx, dz);
        if (d >= reach || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        const total = a.mass + b.mass;
        const fix = (reach - d) * 0.5;
        a.x -= nx * fix * (b.mass / total);
        a.z -= nz * fix * (b.mass / total);
        b.x += nx * fix * (a.mass / total);
        b.z += nz * fix * (a.mass / total);
        const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (closing > 0) {
          const impulse = (closing * 1.2) / total;
          a.vx -= nx * impulse * b.mass;
          a.vz -= nz * impulse * b.mass;
          b.vx += nx * impulse * a.mass;
          b.vz += nz * impulse * a.mass;
        }
      }
    }

    // Drift on, slowed by the water and stopped by the land.
    const drag = Math.exp(-dt * 0.42);
    for (const b of bodies) {
      const nx = b.x + b.vx * dt;
      const nz = b.z + b.vz * dt;
      if (this.world.navDistance(nx, nz) < b.rad * 0.8) {
        b.vx *= -0.25;
        b.vz *= -0.25;
      } else {
        b.x = nx;
        b.z = nz;
      }
      b.vx *= drag;
      b.vz *= drag;
      if (Math.abs(b.vx) + Math.abs(b.vz) < 0.004) {
        b.vx = 0;
        b.vz = 0;
      }
      if (b.index !== undefined) {
        this.write(b.index);
        dirty = true;
      }
    }
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.skirts.instanceMatrix.needsUpdate = true;
    }
    this.updateBroken(dt, time);
  }

  updateBroken(dt, time) {
    for (let b = this.broken.length - 1; b >= 0; b--) {
      const fl = this.broken[b];
      fl.age += dt;
      fl.mesh.position.y = waveHeight(this.world, fl.x, fl.z, time, waveState.geo);
      fl.halo.position.y = fl.mesh.position.y;
      const out = fl.mesh.geometry.attributes.position;
      const haloOut = fl.halo.geometry.attributes.position;
      const haloCol = fl.halo.geometry.attributes.color;
      const iceCol = fl.mesh.geometry.attributes.color;
      let afloat = false;
      for (const p of fl.pieces) {
        if (p.fade >= 1) {
          if (!p.gone) {
            p.gone = true;
            for (let v = p.start; v < p.end; v++) iceCol.setW(v, 0);
            for (let v = p.haloStart; v < p.haloEnd; v++) haloCol.setW(v, 0);
          }
          continue;
        }
        afloat = true;
        p.rot += p.spin * dt;
        p.spin *= 1 - dt * 0.1;
        p.float -= dt;
        // Waterlogged: it settles lower and lower while slowly fading out of sight.
        if (p.float <= 0) {
          p.fade = Math.min(1, p.fade + dt / p.fadeTime);
          p.y = -0.2 * p.fade * p.fade;
          p.tilt = 0.28 * p.fade;
        }
        const bob = p.float > 0 ? Math.sin(fl.age * 1.5 + p.wob) * 0.012 : 0;
        const shiftX = p.x - fl.x - p.mx;
        const shiftZ = p.z - fl.z - p.mz;
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
        // Its rim follows exactly, and fades as the ice goes under.
        const iceAlpha = 1 - p.fade * p.fade * (3 - 2 * p.fade);
        for (let v = p.start; v < p.end; v++) iceCol.setW(v, iceAlpha);
        const haloAlpha = iceAlpha;
        for (let v = p.haloStart; v < p.haloEnd; v++) {
          const rx = fl.haloRest[v * 3] - p.mx;
          const rz = fl.haloRest[v * 3 + 2] - p.mz;
          haloOut.setXYZ(v, p.mx + rx * c + rz * s + shiftX, 0, p.mz - rx * s + rz * c + shiftZ);
          haloCol.setW(v, haloAlpha);
        }
      }
      out.needsUpdate = true;
      haloOut.needsUpdate = true;
      haloCol.needsUpdate = true;
      iceCol.needsUpdate = true;
      if (!afloat) this.dropBroken(b);
    }
  }
}
