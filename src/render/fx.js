// Particles: broken white wake flecks, splashes, falling rain and light snow.
import * as THREE from 'three';
import { mistUniforms } from './mist.js';

const dummy = new THREE.Object3D();

export class Flecks {
  constructor(scene, max = 520) {
    this.max = max;
    this.items = Array.from({ length: max }, () => ({ life: 0 }));
    this.head = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: '#fbfcf8', transparent: true, opacity: 0.95, depthWrite: false }),
      max,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  spawn(x, z, vx, vz, life, w, l, rot, y = 0.14, vy = 0) {
    const it = this.items[this.head];
    this.head = (this.head + 1) % this.max;
    Object.assign(it, { x, y, z, vx, vy, vz, life, maxLife: life, w, l, rot });
  }

  splash(x, z, n = 26, strength = 3.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const v = strength * (0.3 + Math.random());
      this.spawn(x, z, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 0.12, 0.22, a, 0.2, 2 + Math.random() * 2.5);
    }
  }

  update(dt) {
    let visible = 0;
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) continue;
      it.x += it.vx * dt;
      it.z += it.vz * dt;
      if (it.vy) {
        it.y += it.vy * dt;
        it.vy -= 9 * dt;
        if (it.y < 0.05) {
          it.y = 0.05;
          it.vy = 0;
        }
      }
      const k = it.life / it.maxLife;
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(0, it.rot, 0);
      dummy.scale.set(it.w * Math.min(1, k * 1.6), 1, it.l * (0.4 + k * 0.6));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(visible++, dummy.matrix);
    }
    this.mesh.count = visible;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Wake {
  constructor(flecks) {
    this.flecks = flecks;
    this.timer = 0;
  }
  update(x, z, heading, speed, dt, length = 6) {
    const sp = Math.abs(speed);
    if (sp < 0.5) return;
    this.timer += dt * (5 + sp * 3.2);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = fz;
    const rz = -fx;
    while (this.timer > 1) {
      this.timer -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const back = (speed > 0 ? -0.5 : 0.48) * length;
      const out = length * 0.13 + Math.random() * 0.3;
      const spread = 0.3 + Math.random() * 0.7;
      this.flecks.spawn(
        x + fx * back + rx * side * out,
        z + fz * back + rz * side * out,
        rx * side * spread - fx * sp * 0.04,
        rz * side * spread - fz * sp * 0.04,
        1.5 + Math.random() * Math.min(2.4, sp * 0.35),
        0.11 + Math.random() * 0.1,
        0.35 + Math.random() * Math.min(1, sp * 0.12),
        heading,
      );
    }
  }
}

export class Rain {
  constructor(scene, count = 700) {
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.seeds = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) this.seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color: '#f7f9f6', transparent: true, opacity: 0, depthWrite: false });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  update(fx, fz, extent, amount, time) {
    this.mesh.visible = amount > 0.02;
    if (!this.mesh.visible) return;
    this.mat.opacity = Math.min(0.7, amount * 0.85);
    const pos = this.mesh.geometry.attributes.position.array;
    const span = 34;
    const n = Math.floor(this.count * Math.min(1, amount + 0.1));
    for (let i = 0; i < this.count; i++) {
      const j = i * 6;
      if (i >= n) {
        pos.fill(0, j, j + 6);
        continue;
      }
      const sx = this.seeds[i * 3];
      const sz = this.seeds[i * 3 + 1];
      const sy = this.seeds[i * 3 + 2];
      const x = fx + (sx - 0.5) * extent * 2.2;
      const z = fz + (sz - 0.5) * extent * 2.2;
      const y = span * (1 - ((time * (1.15 + sy * 0.5) + sy * 7) % 1));
      pos[j] = x;
      pos[j + 1] = y + 1.7;
      pos[j + 2] = z;
      pos[j + 3] = x;
      pos[j + 4] = y;
      pos[j + 5] = z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

export class Snow {
  constructor(scene, count = 180) {
    this.count = count;
    this.seeds = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) this.seeds[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.mat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false });
    this.mesh = new THREE.Points(geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(fx, fz, extent, opacity, time) {
    this.mat.opacity = opacity;
    this.mesh.visible = opacity > 0.02;
    if (!this.mesh.visible) return;
    const pos = this.mesh.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      const sx = this.seeds[i * 3];
      const sz = this.seeds[i * 3 + 1];
      const sy = this.seeds[i * 3 + 2];
      const w = extent * 2.2;
      const x = ((sx * w + Math.sin(time * 0.3 + sy * 9) * 2 + time * 0.5) % w) - w / 2;
      const z = ((sz * w + Math.cos(time * 0.24 + sx * 9) * 2) % w) - w / 2;
      pos[i * 3] = fx + x;
      pos[i * 3 + 1] = 26 * (1 - ((time * (0.03 + sy * 0.03) + sy) % 1));
      pos[i * 3 + 2] = fz + z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// Gulls wheel over the harbour and follow the ship for a while, a simple V that
// flaps by squashing its wings. Movement matters here, not the model.
export class Gulls {
  constructor(scene, material, count = 18) {
    const pos = [0, 0, 0.16, -0.72, 0.22, -0.02, 0, 0, -0.16, 0, 0, 0.16, 0, 0, -0.16, 0.72, 0.22, -0.02];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const col = new Float32Array(18).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.birds = Array.from({ length: count }, (_, i) => ({
      r: 8 + (i * 37) % 17,
      a: i * 2.1,
      v: (0.28 + ((i * 13) % 9) * 0.03) * (i % 2 ? 1 : -1),
      h: 5 + (i * 7) % 6,
      flap: 5 + (i % 4),
      chase: i % 3 === 0,
      cx: 0,
      cz: 0,
    }));
    scene.add(this.mesh);
  }

  update(time, dt, portX, portZ, shipX, shipZ) {
    this.birds.forEach((b, i) => {
      const tx = b.chase ? shipX : portX;
      const tz = b.chase ? shipZ : portZ;
      if (b.cx === 0 && b.cz === 0) {
        b.cx = tx;
        b.cz = tz;
      }
      const k = 1 - Math.exp(-dt * 0.35);
      b.cx += (tx - b.cx) * k;
      b.cz += (tz - b.cz) * k;
      b.a += b.v * dt;
      const x = b.cx + Math.cos(b.a) * b.r;
      const z = b.cz + Math.sin(b.a) * b.r;
      const glide = Math.sin(time * 0.6 + i) > 0.1;
      const s = glide ? 0.5 : Math.sin(time * b.flap + i) * 0.9;
      dummy.position.set(x, b.h + Math.sin(time * 0.5 + i) * 0.7, z);
      dummy.rotation.set(0, -b.a + (b.v > 0 ? 0 : Math.PI), 0);
      dummy.scale.set(0.9, s, 0.9);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// The ship's own water. A foam ribbon is laid down along the path it actually sailed,
// so the wake curves when it turns: a churned band straight behind the stern and two
// arms spreading out to the sides, all eaten away by the same lace as the shore foam.
// Two short curls peel off the bow. Painted on the water, under everything afloat.
const WAKE_VERT = /* glsl */ `
  attribute float aAge;
  attribute float aAcross;
  attribute float aPower;
  varying vec2 vW;
  varying float vAge;
  varying float vAcross;
  varying float vPower;
  void main() {
    vW = position.xz;
    vAge = aAge;
    vAcross = aAcross;
    vPower = aPower;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;
const WAKE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uFoamTone;
  uniform vec3 uMistColor;
  uniform vec2 uFocus;
  uniform float uMistNear;
  uniform float uMistFar;
  uniform float uMistAmount;
  uniform float uTime;
  varying vec2 vW;
  varying float vAge;
  varying float vAcross;
  varying float vPower;
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    // Three turned octaves, so no grid shows through, thresholded softly.
    vec2 p1 = mat2(0.87, -0.5, 0.5, 0.87) * vW;
    vec2 p2 = mat2(0.5, 0.87, -0.87, 0.5) * vW;
    float lace = noise(p1 * 1.9 + uTime * 0.05) * 0.5 + noise(p2 * 4.3 - uTime * 0.09) * 0.32 + noise(vW * 9.1 + uTime * 0.14) * 0.18;
    float broad = noise(p2 * 0.3 + 3.0);
    float edge = 1.0 - smoothstep(0.3, 1.0, abs(vAcross) + (broad - 0.5) * 0.6 + (lace - 0.5) * 0.45);
    float cut = mix(0.36, 0.74, vAge);
    float foam = smoothstep(cut, cut + 0.2, lace) * edge * vPower * (1.0 - smoothstep(0.5, 1.0, vAge));
    if (foam < 0.004) discard;
    vec3 col = mix(uFoamTone, uMistColor, smoothstep(uMistNear, uMistFar, distance(vW, uFocus)) * uMistAmount);
    gl_FragColor = vec4(col, foam * 0.72);
    #include <colorspace_fragment>
  }
`;

export class ShipWake {
  constructor(scene) {
    this.samples = [];
    this.timer = 0;
    this.time = 0;
    this.maxVerts = 2600;
    const geo = new THREE.BufferGeometry();
    const attr = (name, size) => {
      const a = new THREE.BufferAttribute(new Float32Array(this.maxVerts * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.pos = attr('position', 3);
    this.age = attr('aAge', 1);
    this.across = attr('aAcross', 1);
    this.power = attr('aPower', 1);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: WAKE_VERT,
      fragmentShader: WAKE_FRAG,
      uniforms: { ...mistUniforms, uTime: { value: 0 }, uFoamTone: { value: new THREE.Color('#f6f9f8') } },
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -0.4;
    scene.add(this.mesh);
    this.count = 0;
  }

  quad(a, b, c, d) {
    if (this.count + 6 > this.maxVerts) return;
    for (const v of [a, b, c, a, c, d]) {
      const i = this.count++;
      this.pos.setXYZ(i, v[0], 0, v[1]);
      this.age.setX(i, v[2]);
      this.across.setX(i, v[3]);
      this.power.setX(i, v[4]);
    }
  }

  // A strip through a list of [x, z, rightX, rightZ, halfWidth, age, power].
  strip(points) {
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const q = points[i + 1];
      this.quad(
        [p[0] - p[2] * p[4], p[1] - p[3] * p[4], p[5], -1, p[6]],
        [p[0] + p[2] * p[4], p[1] + p[3] * p[4], p[5], 1, p[6]],
        [q[0] + q[2] * q[4], q[1] + q[3] * q[4], q[5], 1, q[6]],
        [q[0] - q[2] * q[4], q[1] - q[3] * q[4], q[5], -1, q[6]],
      );
    }
  }

  update(dt, x, z, heading, speed, length, beam, topSpeed) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = fz;
    const rz = -fx;
    const pace = Math.abs(speed);
    const dir = speed >= 0 ? 1 : -1;
    const power = Math.min(1, pace / Math.max(1, topSpeed * 0.55));
    const life = 11;

    // New wake is laid at the stern, in the direction she is leaving behind.
    this.timer += dt;
    if (this.timer > 0.22) {
      this.timer = 0;
      const moving = pace > 0.35;
      if (moving || this.wasMoving) {
        this.samples.push({
          x: x - fx * dir * length * 0.47,
          z: z - fz * dir * length * 0.47,
          rx,
          rz,
          t: this.time,
          power: moving ? power : 0,
          pace,
        });
      }
      this.wasMoving = moving;
    }
    while (this.samples.length && this.time - this.samples[0].t > life) this.samples.shift();

    this.count = 0;
    const live = {
      x: x - fx * dir * length * 0.47,
      z: z - fz * dir * length * 0.47,
      rx,
      rz,
      t: this.time,
      power: pace > 0.35 ? power : 0,
      pace,
    };
    const path = pace > 0.35 ? [...this.samples, live] : this.samples;
    if (path.length > 1) {
      const churn = [];
      const left = [];
      const right = [];
      for (const s of path) {
        const sec = this.time - s.t;
        const age = sec / life;
        // The churned band widens slowly and dies first.
        churn.push([s.x, s.z, s.rx, s.rz, beam * 0.34 + sec * 0.13, Math.min(1, age * 1.7), s.power * 0.85]);
        // The arms ride outward at a speed set by how fast she was going, as a wake does.
        const out = beam * 0.46 + sec * (0.2 + s.pace * 0.16);
        const w = 0.16 + sec * 0.075;
        const fade = s.power * 0.75 * Math.min(1, sec * 2.2 + 0.25);
        left.push([s.x - s.rx * out, s.z - s.rz * out, s.rx, s.rz, w, age, fade]);
        right.push([s.x + s.rx * out, s.z + s.rz * out, s.rx, s.rz, w, age, fade]);
      }
      this.strip(churn);
      this.strip(left);
      this.strip(right);
    }

    // Bow wave: two curls peeling off the stem and running back along the hull.
    if (pace > 0.3) {
      const bowPower = Math.min(1, pace / 3.2) * 0.95;
      for (const side of [-1, 1]) {
        const pts = [];
        const n = 10;
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const along = dir * length * (0.5 - u * 0.66);
          const outward = beam * 0.5 * Math.pow(Math.sin(Math.min(1, u * 1.7) * Math.PI * 0.5), 0.8) + u * u * (0.25 + pace * 0.14) + 0.04;
          const px = x + fx * along + rx * side * outward;
          const pz = z + fz * along + rz * side * outward;
          // Widths open outward so the crest throws its foam away from the hull.
          const w = 0.08 + u * (0.26 + pace * 0.035);
          pts.push([px + rx * side * w, pz + rz * side * w, rx, rz, w, 0.05 + u * 0.72, bowPower * (1 - u * 0.25)]);
        }
        this.strip(pts);
      }
    }

    this.mesh.geometry.setDrawRange(0, this.count);
    this.pos.needsUpdate = true;
    this.age.needsUpdate = true;
    this.across.needsUpdate = true;
    this.power.needsUpdate = true;
  }
}

const SMOKE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aSeed;
  uniform float uScale;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vAlpha = aAlpha;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale;
  }
`;
const SMOKE_FRAG = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    // A soft ball, with a slow irregular edge so that puffs never read as discs.
    float a = atan(p.y, p.x);
    float edge = 0.78 + 0.16 * sin(a * 3.0 + vSeed) + 0.06 * sin(a * 7.0 - vSeed * 1.7);
    float soft = 1.0 - smoothstep(0.0, edge, r);
    gl_FragColor = vec4(vec3(0.96, 0.97, 0.98), soft * soft * vAlpha);
    #include <colorspace_fragment>
  }
`;

// Small signs of life: smoke rising from the town, and the ship's mooring lines.
export class TownLife {
  constructor(scene, material, smokes, world) {
    this.smokes = smokes;
    this.world = world;
    // Smoke: many faint, soft-edged puffs. None is visible alone; they add up to a
    // plume that thins and spreads as it rises and leans away with the wind.
    this.maxPuffs = 700;
    this.puffs = Array.from({ length: this.maxPuffs }, () => ({ life: 0 }));
    this.head = 0;
    const geo = new THREE.BufferGeometry();
    const attr = (name, size) => {
      const a = new THREE.BufferAttribute(new Float32Array(this.maxPuffs * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.pPos = attr('position', 3);
    this.pSize = attr('aSize', 1);
    this.pAlpha = attr('aAlpha', 1);
    this.pSeed = attr('aSeed', 1);
    geo.setDrawRange(0, 0);
    this.puffMat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      uniforms: { uScale: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    this.puffMesh = new THREE.Points(geo, this.puffMat);
    this.puffMesh.frustumCulled = false;
    scene.add(this.puffMesh);
    this.timers = smokes.map((_, i) => i * 0.13);
    this.shipTimer = 0;

    // Mooring lines, shown while she is alongside.
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#3a3430' }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  spawn(x, y, z, size, rise, dark) {
    const p = this.puffs[this.head];
    this.head = (this.head + 1) % this.maxPuffs;
    const a = Math.random() * 6.283;
    const off = size * 0.5 * Math.random();
    Object.assign(p, {
      x: x + Math.cos(a) * off,
      y,
      z: z + Math.sin(a) * off,
      size,
      rise: rise * (0.8 + Math.random() * 0.4),
      life: 1,
      max: 5 + Math.random() * 3,
      seed: Math.random() * 100,
      dark,
      vx: (Math.random() - 0.5) * 0.1,
      vz: (Math.random() - 0.5) * 0.1,
    });
  }

  update(time, dt, ship, speed, docked, game, pxPerUnit, focus) {
    // Chimneys trickle steadily, and only those near enough to be seen.
    this.smokes.forEach((c, i) => {
      this.timers[i] -= dt;
      if (this.timers[i] > 0) return;
      this.timers[i] = 0.28 + Math.random() * 0.2;
      if (Math.abs(c.x - focus.x) < 120 && Math.abs(c.z - focus.z) < 120) this.spawn(c.x, c.y, c.z, 0.34, 0.42, false);
    });
    // The stack works harder the faster she goes.
    const u = ship.userData;
    const k = u.length / 8;
    const fx = Math.sin(ship.rotation.y);
    const fz = Math.cos(ship.rotation.y);
    const pace = Math.abs(speed);
    this.shipTimer -= dt;
    if (this.shipTimer <= 0 && u.stack) {
      this.shipTimer = Math.max(0.05, 0.3 - pace * 0.03);
      const { x, y, z } = u.stack;
      this.spawn(ship.position.x + fz * x + fx * z, y + 0.05, ship.position.z - fx * x + fz * z, 0.26 + pace * 0.025, 0.55 + pace * 0.03, true);
    }
    this.puffMat.uniforms.uScale.value = pxPerUnit;
    let live = 0;
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt / p.max;
      if (p.life <= 0) continue;
      const age = 1 - p.life;
      // Rising slows; a light wind and slow eddies carry it off.
      p.y += p.rise * dt * (1 - age * 0.72);
      p.x += (p.vx + 0.2 + age * 0.22 + Math.sin(time * 0.6 + p.seed) * 0.1) * dt;
      p.z += (p.vz + 0.09 + age * 0.1 + Math.cos(time * 0.47 + p.seed * 1.3) * 0.1) * dt;
      this.pPos.setXYZ(live, p.x, p.y, p.z);
      this.pSize.setX(live, p.size * (1 + age * 5.5));
      const fadeIn = Math.min(1, age * 7);
      this.pAlpha.setX(live, fadeIn * (1 - age) ** 1.7 * (p.dark ? 0.2 : 0.14));
      this.pSeed.setX(live, p.seed);
      live++;
    }
    this.puffMesh.geometry.setDrawRange(0, live);
    this.pPos.needsUpdate = true;
    this.pSize.needsUpdate = true;
    this.pAlpha.needsUpdate = true;
    this.pSeed.needsUpdate = true;

    // Bow and stern lines to the pier bollards.
    this.lines.visible = docked;
    if (docked) {
      const pos = this.lines.geometry.attributes.position;
      const { port } = game.world;
      const lever = u.length * 0.42;
      const y = 1.1 * k;
      pos.setXYZ(0, ship.position.x + fx * lever - 0.3, y, ship.position.z + fz * lever);
      pos.setXYZ(1, port.pier.x1, 1.9, ship.position.z + fz * (lever + 2.4));
      pos.setXYZ(2, ship.position.x - fx * lever - 0.3, y, ship.position.z - fz * lever);
      pos.setXYZ(3, port.pier.x1, 1.9, ship.position.z - fz * (lever + 2.4));
      pos.needsUpdate = true;
    }
  }
}
TownLife.dummy = new THREE.Object3D();
