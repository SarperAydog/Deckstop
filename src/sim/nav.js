// A* over a coarse sea grid, then string-pulled so the autopilot sails straight
// legs instead of tracing grid cells.
const CELL = 4;
const CLEARANCE = 4.5;

export function createNav(world) {
  const n = Math.floor(world.size / CELL);
  const half = world.half;
  const blocked = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const wx = x * CELL - half + CELL / 2;
      const wz = z * CELL - half + CELL / 2;
      if (world.navDistance(wx, wz) < CLEARANCE) blocked[z * n + x] = 1;
    }
  }
  const toCell = (v) => Math.max(0, Math.min(n - 1, Math.floor((v + half) / CELL)));
  const toWorld = (c) => c * CELL - half + CELL / 2;

  const lineClear = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / 2);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      if (world.navDistance(ax + (bx - ax) * t, az + (bz - az) * t) < CLEARANCE - 1) return false;
    }
    return true;
  };

  const nearestOpen = (cx, cz) => {
    if (!blocked[cz * n + cx]) return [cx, cz];
    for (let r = 1; r < 24; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x >= 0 && z >= 0 && x < n && z < n && !blocked[z * n + x]) return [x, z];
        }
      }
    }
    return [cx, cz];
  };

  const findPath = (ax, az, bx, bz) => {
    if (lineClear(ax, az, bx, bz)) return [{ x: bx, z: bz }];
    const [sx, sz] = nearestOpen(toCell(ax), toCell(az));
    const [gx, gz] = nearestOpen(toCell(bx), toCell(bz));
    const start = sz * n + sx;
    const goal = gz * n + gx;
    const g = new Float32Array(n * n).fill(Infinity);
    const from = new Int32Array(n * n).fill(-1);
    const heap = [];
    const heur = (i) => Math.hypot((i % n) - gx, Math.floor(i / n) - gz);
    const push = (i, f) => {
      heap.push([f, i]);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heap[p][0] <= heap[c][0]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let p = 0;
        for (;;) {
          const l = 2 * p + 1;
          const r = l + 1;
          let m = p;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === p) break;
          [heap[p], heap[m]] = [heap[m], heap[p]];
          p = m;
        }
      }
      return top;
    };
    g[start] = 0;
    push(start, heur(start));
    let found = false;
    while (heap.length) {
      const [, cur] = pop();
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % n;
      const cz = Math.floor(cur / n);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const next = z * n + x;
          if (blocked[next]) continue;
          // No cutting across a blocked corner.
          if (dx && dz && (blocked[cz * n + x] || blocked[z * n + cx])) continue;
          const cost = g[cur] + (dx && dz ? 1.414 : 1);
          if (cost < g[next]) {
            g[next] = cost;
            from[next] = cur;
            push(next, cost + heur(next));
          }
        }
      }
    }
    if (!found) return [{ x: bx, z: bz }];
    const raw = [];
    for (let c = goal; c !== -1; c = from[c]) raw.unshift({ x: toWorld(c % n), z: toWorld(Math.floor(c / n)) });
    raw.push({ x: bx, z: bz });

    const out = [];
    let ox = ax;
    let oz = az;
    let i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !lineClear(ox, oz, raw[j].x, raw[j].z)) j--;
      out.push(raw[j]);
      ox = raw[j].x;
      oz = raw[j].z;
      i = j + 1;
    }
    return out;
  };

  return { findPath };
}
