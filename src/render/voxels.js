// A low-res voxel copy of the whole world, used purely for light. Bad North bakes AO
// by marching a branching tree of rays through such a volume; here the same tree is
// run as one top-down sweep, so every voxel simply averages the five voxels above it
// and an early block prunes everything behind it. The result goes into a 3D texture
// that anything can sample: the land, the houses, the ship, a buoy.
import * as THREE from 'three';

const CX = 1.25;
const CY = 1;
const NY = 30;
const Y0 = -2;

export class VoxelField {
  constructor(world) {
    this.world = world;
    this.nx = Math.round(world.size / CX);
    this.nz = this.nx;
    this.ny = NY;
    this.x0 = -world.half;
    this.z0 = -world.half;
    this.occ = new Uint8Array(this.nx * this.nz * NY);
    const { nx, nz } = this;
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const h = world.heightAt(this.x0 + (x + 0.5) * CX, this.z0 + (z + 0.5) * CX);
        const top = Math.min(NY, Math.floor((h - Y0) / CY));
        for (let y = 0; y < top; y++) this.occ[this.idx(x, y, z)] = 255;
      }
    }
  }

  idx(x, y, z) {
    return x + z * this.nx + y * this.nx * this.nz;
  }

  // Marks an axis-aligned block as (partly) solid. Trees use a density below 1.
  addBox(x0, x1, y0, y1, z0, z1, density = 1) {
    const ix0 = Math.max(0, Math.floor((x0 - this.x0) / CX));
    const ix1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / CX));
    const iz0 = Math.max(0, Math.floor((z0 - this.z0) / CX));
    const iz1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / CX));
    const iy0 = Math.max(0, Math.floor((y0 - Y0) / CY));
    const iy1 = Math.min(NY - 1, Math.floor((y1 - Y0) / CY));
    const v = Math.round(density * 255);
    for (let y = iy0; y <= iy1; y++) {
      for (let z = iz0; z <= iz1; z++) {
        for (let x = ix0; x <= ix1; x++) {
          const i = this.idx(x, y, z);
          if (this.occ[i] < v) this.occ[i] = v;
        }
      }
    }
  }

  bake() {
    const { nx, nz, ny, occ } = this;
    const layer = nx * nz;
    const vis = new Uint8Array(layer * ny);
    vis.fill(255, layer * (ny - 1));
    for (let y = ny - 2; y >= 0; y--) {
      const here = y * layer;
      const up = (y + 1) * layer;
      for (let z = 0; z < nz; z++) {
        const zm = z > 0 ? -nx : 0;
        const zp = z < nz - 1 ? nx : 0;
        for (let x = 0; x < nx; x++) {
          const i = x + z * nx;
          const xm = x > 0 ? -1 : 0;
          const xp = x < nx - 1 ? 1 : 0;
          const a = (vis[up + i] * 2 + vis[up + i + xm] + vis[up + i + xp] + vis[up + i + zm] + vis[up + i + zp]) / 6;
          vis[here + i] = a * (1 - occ[here + i] / 255);
        }
      }
    }
    this.vis = vis;
    const tex = new THREE.Data3DTexture(vis, nx, nz, ny);
    tex.format = THREE.RedFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    this.texture = tex;
    return tex;
  }

  applyTo(uniforms) {
    uniforms.uVox.value = this.texture;
    uniforms.uVoxMin.value.set(this.x0, Y0, this.z0);
    uniforms.uVoxSize.value.set(this.nx * CX, this.ny * CY, this.nz * CX);
  }

  sample(wx, wy, wz) {
    const x = Math.min(this.nx - 1, Math.max(0, Math.floor((wx - this.x0) / CX)));
    const z = Math.min(this.nz - 1, Math.max(0, Math.floor((wz - this.z0) / CX)));
    const y = Math.min(this.ny - 1, Math.max(0, Math.floor((wy - Y0) / CY)));
    return this.vis[this.idx(x, y, z)];
  }

  // The direction light would come from: voxel normals light a whole forest as one
  // blob rather than as a thousand little cones.
  normalAt(wx, wy, wz, out, reach = 3) {
    const nx = this.sample(wx + reach, wy, wz) - this.sample(wx - reach, wy, wz);
    const ny = this.sample(wx, wy + reach, wz) - this.sample(wx, wy - reach, wz);
    const nz = this.sample(wx, wy, wz + reach) - this.sample(wx, wy, wz - reach);
    out.set(nx, ny + 12, nz);
    return out.normalize();
  }
}
