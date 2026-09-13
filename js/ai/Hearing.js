import { SuspicionSystem } from './Suspicion.js';
import { recordHeard } from './Memory.js';
import { tileSeed, worldToTile } from '../core/WorldConfig.js';

function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function forestOcclusion(from, to) {
  let density = 0;
  const samples = 5;
  for (let i = 1; i <= samples; i++) {
    const t = i / (samples + 1);
    const x = from.x + (to.x - from.x) * t;
    const z = from.z + (to.z - from.z) * t;
    const { tx, tz } = worldToTile(x, z);
    density += tileSeed(tx, tz, 7);
  }
  density /= samples;
  return Math.max(0.3, 1 - density * 0.55);
}

export function processHearing(monster, events, now, suspicion) {
  const heard = [];
  for (const ev of events) {
    const dist = distance(monster.position, ev.position);
    if (dist > ev.radius) continue;
    const atten = Math.max(0, 1 - dist / ev.radius);
    const occ = forestOcclusion(ev.position, monster.position);
    const perceived = ev.intensity * atten * occ;
    if (perceived < 0.05) continue;
    heard.push(ev);
    suspicion.add(SuspicionSystem.intensityToSuspicion(perceived, atten * occ));
    recordHeard(monster.memory, ev.position, perceived, now);
    monster.memory.suspicion = suspicion.value;
  }
  return heard;
}
