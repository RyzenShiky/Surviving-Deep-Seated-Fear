import { MonsterPerception } from '../ai/Perception.js';
import { pickSearchTarget } from '../ai/StateMachine.js';
import { clampToWorld } from '../core/WorldConfig.js';
import { resolveCollisions, groundHeight } from '../core/Collision.js';

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class MonsterController {
  constructor(state, index = 0, colliders = []) {
    this.state = state;
    this.index = index;
    this.colliders = colliders;
    this.perception = new MonsterPerception();
    this.target = null;
    this.moveSpeed = 2.4;
    this.patrolAngle = Math.random() * Math.PI * 2;
    this.attackCooldown = 0;
  }

  update(dt, now, playerPos = null) {
    const m = this.state.data.monsters[this.index];
    if (!m) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const events = this.state.data.world.activeSoundEvents.filter((e) => now - e.timestamp < 2.5);
    this.perception.update(m, events, now, dt);

    // In CHASE, prefer lastHeard or approximate toward recent sound; still no true wallhack
    switch (m.aiState) {
      case 'PATROL':
        this.widePatrol(m, dt);
        break;
      case 'INVESTIGATE':
        if (m.memory.lastHeardPosition) {
          this.moveToward(m, m.memory.lastHeardPosition, dt, this.moveSpeed * 1.25);
        }
        break;
      case 'SEARCH':
        if (!this.target || dist(m.position, this.target) < 1.5) {
          this.target = pickSearchTarget(m.memory);
        }
        if (this.target) this.moveToward(m, this.target, dt, this.moveSpeed * 0.95);
        break;
      case 'CHASE':
        if (m.memory.lastHeardPosition) {
          this.moveToward(m, m.memory.lastHeardPosition, dt, this.moveSpeed * 1.85);
        }
        break;
    }

    resolveCollisions(m.position, 0.55, this.colliders);
    const c = clampToWorld(m.position.x, m.position.z);
    m.position.x = c.x;
    m.position.z = c.z;
    m.position.y = groundHeight(m.position.x, m.position.z);

    // Attack if close to player
    const p = this.state.data.player;
    if (p.alive && dist(m.position, p.position) < 1.6 && this.attackCooldown <= 0) {
      if (m.aiState === 'CHASE' || m.aiState === 'INVESTIGATE' || m.memory.suspicion > 40) {
        p.health = Math.max(0, p.health - 34);
        this.attackCooldown = 1.2;
        this.state.emitSound({
          position: { ...m.position },
          intensity: 1,
          radius: 35,
          type: 'impact',
        });
        if (p.health <= 0) {
          p.alive = false;
          this.state.data.progress.deaths += 1;
          this.state.data.progress.gameOver = true;
          this.state.data.progress.win = false;
        }
      }
    }

    // HUD: max suspicion among monsters
    const ind = document.getElementById('suspicion-indicator');
    if (ind && this.index === 0) {
      let maxS = 0;
      for (const mon of this.state.data.monsters) {
        maxS = Math.max(maxS, mon.memory.suspicion || 0);
      }
      ind.className = '';
      if (maxS >= 70) ind.classList.add('high');
      else if (maxS >= 40) ind.classList.add('mid');
      else if (maxS >= 15) ind.classList.add('low');
    }
  }

  moveToward(m, target, dt, speed) {
    const dx = target.x - m.position.x;
    const dz = target.z - m.position.z;
    const d = Math.hypot(dx, dz) || 1;
    m.position.x += (dx / d) * speed * dt;
    m.position.z += (dz / d) * speed * dt;
    m.rotation.yaw = Math.atan2(-dx, -dz);
  }

  widePatrol(m, dt) {
    this.patrolAngle += dt * 0.12;
    const phase = this.index * 2.1;
    const tx = Math.cos(this.patrolAngle + phase) * (45 + this.index * 12);
    const tz = Math.sin(this.patrolAngle * 0.7 + phase) * (35 + this.index * 8) - 5;
    this.moveToward(m, { x: tx, y: 0, z: tz }, dt, this.moveSpeed * 0.75);
  }
}
