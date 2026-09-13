import { clampToWorld } from '../core/WorldConfig.js';
import { resolveCollisions, groundHeight } from '../core/Collision.js';

const WALK = 2.8, RUN = 5.5, CROUCH = 1.4;
const STAMINA_DRAIN = 25, STAMINA_REGEN = 18;
const PLAYER_RADIUS = 0.4;

export class PlayerController {
  constructor(canvas, state, colliders = [], audio = null) {
    this.canvas = canvas;
    this.state = state;
    this.colliders = colliders;
    this.audio = audio;
    this.keys = new Set();
    this.pointerLocked = false;
    this.sensitivity = 0.0022;
    this.touchSensitivity = 0.0045;
    this._footAcc = 0;
    this.flashlightOn = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat) {
        this.flashlightOn = !this.flashlightOn;
        if (this.state.data.player) this.state.data.player.flashlight = this.flashlightOn;
      }
    });

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('click', () => {
      if (!('ontouchstart' in window)) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.applyLook(e.movementX, e.movementY, this.sensitivity);
    });
  }

  applyLook(dx, dy, sens = this.touchSensitivity) {
    const p = this.state.data.player;
    p.rotation.yaw -= dx * sens;
    p.rotation.pitch -= dy * sens;
    p.rotation.pitch = Math.max(-1.4, Math.min(1.4, p.rotation.pitch));
  }

  update(dt) {
    const p = this.state.data.player;
    if (!p.alive) return;
    p.flashlight = this.flashlightOn;

    p.isCrouching = this.keys.has('ControlLeft') || this.keys.has('KeyC');
    p.isRunning = this.keys.has('ShiftLeft') && !p.isCrouching && p.stamina > 5;

    let speed = WALK;
    if (p.isCrouching) speed = CROUCH;
    else if (p.isRunning) speed = RUN;

    const forward = { x: -Math.sin(p.rotation.yaw), z: -Math.cos(p.rotation.yaw) };
    const right = { x: Math.cos(p.rotation.yaw), z: -Math.sin(p.rotation.yaw) };
    let mx = 0, mz = 0;
    if (this.keys.has('KeyW')) { mx += forward.x; mz += forward.z; }
    if (this.keys.has('KeyS')) { mx -= forward.x; mz -= forward.z; }
    if (this.keys.has('KeyA')) { mx -= right.x; mz -= right.z; }
    if (this.keys.has('KeyD')) { mx += right.x; mz += right.z; }
    const len = Math.hypot(mx, mz) || 1;
    const moving = mx !== 0 || mz !== 0;
    mx = (mx / len) * speed;
    mz = (mz / len) * speed;

    p.position.x += mx * dt;
    p.position.z += mz * dt;
    resolveCollisions(p.position, PLAYER_RADIUS, this.colliders);
    const c = clampToWorld(p.position.x, p.position.z);
    p.position.x = c.x;
    p.position.z = c.z;
    p.position.y = 1.7 + groundHeight(p.position.x, p.position.z);

    if (p.isRunning && moving) {
      p.stamina = Math.max(0, p.stamina - STAMINA_DRAIN * dt);
      this._footAcc += dt * 4;
    } else {
      p.stamina = Math.min(100, p.stamina + STAMINA_REGEN * dt);
      if (moving) this._footAcc += dt * (p.isCrouching ? 1.2 : 2.2);
    }

    while (this._footAcc >= 1) {
      this._footAcc -= 1;
      if (!moving) break;
      const intensity = p.isRunning ? 0.9 : p.isCrouching ? 0.12 : 0.38;
      const radius = p.isRunning ? 28 : p.isCrouching ? 7 : 14;
      this.state.emitSound({
        position: { ...p.position },
        intensity,
        radius,
        type: 'footstep',
      });
      if (this.audio) {
        this.audio.playFootstep(p.position.x, p.position.y, p.position.z, intensity);
      }
    }

    const fill = document.getElementById('stamina-fill');
    if (fill) fill.style.width = `${p.stamina}%`;
  }

  get eyePosition() {
    const p = this.state.data.player;
    return {
      x: p.position.x,
      y: p.position.y - (p.isCrouching ? 0.55 : 0),
      z: p.position.z,
    };
  }
}
