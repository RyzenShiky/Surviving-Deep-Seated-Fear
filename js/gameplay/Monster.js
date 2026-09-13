import { MonsterPerception } from '../ai/Perception.js';
import { pickSearchTarget } from '../ai/StateMachine.js';
import { clampToWorld } from '../core/WorldConfig.js';
import { resolveCollisions, groundHeight } from '../core/Collision.js';

function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export class MonsterController {
  constructor(state, index = 0, colliders = [], room = null) {
    this.state = state;
    this.index = index;
    this.colliders = colliders;
    this.room = room;
    this.perception = new MonsterPerception();
    this.target = null;
    this.moveSpeed = 2.4;
    this.patrolAngle = Math.random() * Math.PI * 2;
    this.attackCooldown = 0;
  }

  setRoom(room) {
    this.room = room;
  }

  /** Base speed multiplied by frenzy from suspicion + last heard intensity */
  _frenzyMul(m) {
    const sus = m.memory.suspicion || 0;
    const intens = m.memory.lastHeardIntensity || 0;
    // 1.0 calm → up to ~2.2 when full panic (loud + high suspicion)
    const fromSus = sus / 100; // 0..1
    const fromSound = Math.min(1, intens); // 0..1
    return 1 + fromSus * 0.7 + fromSound * 0.5;
  }

  update(dt, now) {
    const m = this.state.data.monsters[this.index];
    if (!m) return;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    const events = this.state.data.world.activeSoundEvents.filter((e) => now - e.timestamp < 2.5);
    this.perception.update(m, events, now, dt);

    const frenzy = this._frenzyMul(m);
    const base = this.moveSpeed;

    switch (m.aiState) {
      case 'PATROL':
        this.widePatrol(m, dt, base * 0.75 * Math.min(1.15, frenzy));
        break;
      case 'INVESTIGATE':
        if (m.memory.lastHeardPosition) {
          this.moveToward(m, m.memory.lastHeardPosition, dt, base * 1.25 * frenzy);
        }
        break;
      case 'SEARCH':
        if (!this.target || distXZ(m.position, this.target) < 1.5) {
          this.target = pickSearchTarget(m.memory);
        }
        if (this.target) this.moveToward(m, this.target, dt, base * 0.95 * frenzy);
        break;
      case 'CHASE':
        // Full panic run when sound was loud
        if (m.memory.lastHeardPosition) {
          this.moveToward(m, m.memory.lastHeardPosition, dt, base * 1.9 * frenzy);
        }
        break;
    }

    resolveCollisions(m.position, 0.55, this.colliders);
    const c = clampToWorld(m.position.x, m.position.z);
    m.position.x = c.x;
    m.position.z = c.z;
    m.position.y = groundHeight(m.position.x, m.position.z);

    this._tryAttack(m);

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

  _tryAttack(m) {
    if (this.attackCooldown > 0) return;
    const canAttack =
      m.aiState === 'CHASE' ||
      m.aiState === 'INVESTIGATE' ||
      (m.memory.suspicion || 0) > 40;
    if (!canAttack) return;

    const targets = [];
    const local = this.state.data.player;
    if (local && local.alive !== false) {
      targets.push({
        kind: 'local',
        uid: this.room?.uid || 'local',
        pos: local.position,
        apply: (dmg) => {
          local.health = Math.max(0, local.health - dmg);
          if (local.health <= 0) {
            local.alive = false;
            this.state.data.progress.deaths += 1;
            this.state.data.progress.gameOver = true;
            this.state.data.progress.win = false;
          }
        },
      });
    }

    if (this.room && this.room.isHost && this.room.remotePlayers) {
      for (const [uid, rp] of Object.entries(this.room.remotePlayers)) {
        if (uid === this.room.uid) continue;
        if (rp.alive === false) continue;
        targets.push({
          kind: 'remote',
          uid,
          pos: { x: rp.x, y: rp.y, z: rp.z },
          apply: (dmg) => this.room.applyDamage(uid, dmg),
        });
      }
    }

    for (const t of targets) {
      if (distXZ(m.position, t.pos) < 1.6) {
        t.apply(34);
        this.attackCooldown = 1.2;
        this.state.emitSound({
          position: { ...m.position },
          intensity: 1,
          radius: 35,
          type: 'impact',
        });
        break;
      }
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

  widePatrol(m, dt, speed) {
    this.patrolAngle += dt * 0.12;
    const phase = this.index * 2.1;
    const tx = Math.cos(this.patrolAngle + phase) * (45 + this.index * 12);
    const tz = Math.sin(this.patrolAngle * 0.7 + phase) * (35 + this.index * 8) - 5;
    this.moveToward(m, { x: tx, y: 0, z: tz }, dt, speed);
  }
}
