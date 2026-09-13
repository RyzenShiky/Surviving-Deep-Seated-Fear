/** 200×200 m forest, center (0,0), tiles 25 m */
export const WORLD = {
  size: 200,
  half: 100,
  tileSize: 25,
  tilesPerSide: 8,
  areaM2: 40000,
};

export function worldToTile(x, z) {
  const tx = Math.floor((x + WORLD.half) / WORLD.tileSize);
  const tz = Math.floor((z + WORLD.half) / WORLD.tileSize);
  return {
    tx: Math.max(0, Math.min(WORLD.tilesPerSide - 1, tx)),
    tz: Math.max(0, Math.min(WORLD.tilesPerSide - 1, tz)),
  };
}

export function tileIndex(tx, tz) {
  return tz * WORLD.tilesPerSide + tx;
}

export function clampToWorld(x, z) {
  return {
    x: Math.max(-WORLD.half + 1, Math.min(WORLD.half - 1, x)),
    z: Math.max(-WORLD.half + 1, Math.min(WORLD.half - 1, z)),
  };
}

export function tileSeed(tx, tz, i) {
  let h = (tx * 73856093) ^ (tz * 19349663) ^ (i * 83492791);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
