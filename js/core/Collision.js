import { WORLD, tileSeed } from './WorldConfig.js';

/**
 * Build simple cylinder colliders matching forest placement (same seed as renderer).
 */
export function buildColliders() {
  const colliders = [];
  const half = WORLD.half;
  const ts = WORLD.tileSize;

  for (let tz = 0; tz < WORLD.tilesPerSide; tz++) {
    for (let tx = 0; tx < WORLD.tilesPerSide; tx++) {
      const ox = -half + tx * ts + ts * 0.5;
      const oz = -half + tz * ts + ts * 0.5;
      const treeCount = 9 + Math.floor(tileSeed(tx, tz, 0) * 6);
      for (let i = 0; i < treeCount; i++) {
        const sx = tileSeed(tx, tz, i * 3 + 1);
        const sz = tileSeed(tx, tz, i * 3 + 2);
        const scale = 0.7 + tileSeed(tx, tz, i * 3 + 3) * 0.9;
        const x = ox + (sx - 0.5) * (ts - 2);
        const z = oz + (sz - 0.5) * (ts - 2);
        if (Math.hypot(x, z) < 6) continue;
        colliders.push({ x, z, r: 0.35 * scale, type: 'tree' });
      }
      const rockCount = 1 + Math.floor(tileSeed(tx, tz, 99) * 3);
      for (let i = 0; i < rockCount; i++) {
        const sx = tileSeed(tx, tz, 200 + i * 2);
        const sz = tileSeed(tx, tz, 201 + i * 2);
        const x = ox + (sx - 0.5) * (ts - 3);
        const z = oz + (sz - 0.5) * (ts - 3);
        if (Math.hypot(x, z) < 5) continue;
        const sc = 0.6 + tileSeed(tx, tz, 300 + i) * 1.4;
        colliders.push({ x, z, r: 0.7 * sc, type: 'rock' });
      }
    }
  }
  return colliders;
}

/** Resolve circle vs circle; mutates pos */
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = radius + c.r;
    if (d > 0 && d < min) {
      const push = (min - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }
}

export function groundHeight(x, z) {
  // Match renderer plane noise
  return Math.sin(x * 0.15) * Math.cos(z * 0.12) * 0.35;
}
