// Particles: broken white wake flecks, splashes, falling rain and light snow.
import * as THREE from 'three';

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
