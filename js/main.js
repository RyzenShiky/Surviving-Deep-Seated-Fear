import { GameState } from './core/GameState.js';
import { Clock } from './core/Clock.js';
import { buildColliders } from './core/Collision.js';
import { isTouchDevice } from './core/Device.js';
import { loadProfile, saveProfile, ensureUid } from './core/Profile.js';
import { PlayerController } from './gameplay/Player.js';
import { MonsterController } from './gameplay/Monster.js';
import { nearestMonsterDist, heartFromDistance } from './gameplay/Proximity.js';
import { AudioManager } from './audio/AudioManager.js';
import { Renderer } from './renderer/Renderer.js';
import { TouchControls } from './input/TouchControls.js';
import { MultiplayerRoom, roomCode as genRoomCode, initFirebase, deviceUid } from './net/firebase.js';
import {
  getAuth, signInAnonymously, GoogleAuthProvider, signInWithRedirect, getRedirectResult,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';

let renderer, player, monsters, audio, clock, state, colliders, touch;
let running = false;
let room = null;
let mode = 'solo';
let netWriteAcc = 0;
let profile = loadProfile();
const ESCAPE_TIME = 300;
let heartAcc = 0;
let lastNearDist = Infinity;

async function init() {
  const canvas = document.getElementById('game-canvas');
  try { initFirebase(); } catch (e) { console.warn('Firebase', e); }

  // Complete Google redirect sign-in if returning from Google
  try {
    const auth = getAuth();
    const cred = await getRedirectResult(auth);
    if (cred && cred.user) {
      profile.displayName = (cred.user.displayName || 'Player').slice(0, 16);
      profile.uid = cred.user.uid;
      profile.provider = 'google';
      localStorage.setItem('longway_uid', profile.uid);
      saveProfile(profile);
      const nameInput = document.getElementById('profile-name');
      if (nameInput) nameInput.value = profile.displayName;
      enterMenu();
    }
  } catch (e) {
    console.warn('getRedirectResult', e);
  }

  // Profile form defaults
  const nameInput = document.getElementById('profile-name');
  if (nameInput) nameInput.value = profile.displayName || '';
  document.querySelectorAll('.color-swatch').forEach((el) => {
    el.classList.toggle('selected', el.dataset.color === profile.avatarColor);
    el.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('selected'));
      el.classList.add('selected');
      profile.avatarColor = el.dataset.color;
    });
  });

  audio = new AudioManager();
  await audio.init();
  colliders = buildColliders();
  renderer = new Renderer();
  await renderer.init(canvas);

  const onResize = () => renderer.resize(canvas.clientWidth, canvas.clientHeight);
  window.addEventListener('resize', onResize);
  onResize();
  clock = new Clock();
  wireUI(canvas);

  // If already guest profile saved, skip login optional — still show login first
}

function refreshContinueBtn() {
  const btn = document.getElementById('btn-continue');
  if (btn) btn.disabled = !GameState.hasSave();
}

function enterMenu() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
  document.getElementById('menu-player-name').textContent =
    `${profile.displayName} · ${profile.provider}`;
  refreshContinueBtn();
}

function setupLocalGame(fromSave = false) {
  if (fromSave) state = GameState.loadLocal() || new GameState();
  else {
    if (mode === 'solo') GameState.clearSave();
    state = new GameState();
  }
  player = new PlayerController(
    document.getElementById('game-canvas'),
    state,
    colliders,
    audio
  );
  monsters = state.data.monsters.map((_, i) => new MonsterController(state, i, colliders, room));

  // Touch controls
  if (isTouchDevice()) {
    if (!touch) {
      touch = new TouchControls(document.getElementById('ui-root'), player.keys, (dx, dy) => {
        player.applyLook(dx, dy);
      });
    } else {
      touch.keys = player.keys;
    }
    touch.onFlashToggle = () => {
        player.flashlightOn = !player.flashlightOn;
        if (state.data.player) state.data.player.flashlight = player.flashlightOn;
      };
      touch.show();
  }
}

function hideTouch() {
  if (touch) touch.hide();
}

function renderLobbyPlayers() {
  const ul = document.getElementById('lobby-players');
  const startBtn = document.getElementById('btn-start-multi');
  const status = document.getElementById('lobby-status');
  if (!ul || !room) return;
  const entries = Object.entries(room.remotePlayers).sort(
    (a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)
  );
  ul.innerHTML = '';
  for (const [uid, p] of entries) {
    const li = document.createElement('li');
    const isHost = room.meta?.hostUid === uid;
    const isYou = uid === room.uid;
    li.textContent = `${p.name || uid.slice(-6)}${isHost ? ' ★ HOST' : ''}${isYou ? ' (you)' : ''}`;
    li.style.padding = '0.25rem 0';
    ul.appendChild(li);
  }
  if (room.isHost) {
    startBtn.classList.remove('hidden');
    status.textContent = `${entries.length} player(s) — Start when ready`;
  } else {
    startBtn.classList.add('hidden');
    status.textContent = room.meta?.started ? 'Host started…' : 'Waiting for host…';
  }
  if (!room.isHost && room.meta?.started && !running) beginMultiGame();
}

function enterLobby() {
  document.getElementById('lobby-code').textContent = room.code;
  document.getElementById('multi-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');
  renderLobbyPlayers();
  room.onUpdate = () => {
    renderLobbyPlayers();
    if (room.meta?.started && !running && !room.isHost) beginMultiGame();
  };
}

async function beginMultiGame() {
  if (running) return;
  mode = 'multi';
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('loading-screen').classList.remove('hidden');
  setupLocalGame(false);
  await audio.resume();
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('room-hud').textContent =
    `Room ${room.code}${room.isHost ? ' (HOST)' : ''}`;
  document.getElementById('room-hud').classList.remove('hidden');
  document.getElementById('game-canvas').focus();
  startLoop();
}

function wireUI(canvas) {
  // Login
  document.getElementById('btn-guest').addEventListener('click', async () => {
    const name = document.getElementById('profile-name').value.trim() || profile.displayName;
    profile.displayName = name.slice(0, 16);
    profile.provider = 'guest';
    ensureUid(profile);
    // align multiplayer uid with profile when possible
    localStorage.setItem('longway_uid', profile.uid);
    saveProfile(profile);
    try {
      const auth = getAuth();
      await signInAnonymously(auth);
    } catch (e) {
      console.warn('Anonymous auth optional fail', e);
    }
    enterMenu();
  });

  document.getElementById('btn-google').addEventListener('click', async () => {
    const err = document.getElementById('login-error');
    err.textContent = '';
    try {
      initFirebase();
      const auth = getAuth();
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
      // Browser navigates away; getRedirectResult in init() finishes login
    } catch (e) {
      console.error(e);
      err.textContent = e.message || 'Google sign-in failed. Use Guest.';
    }
  });

  document.getElementById('btn-profile').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  });

  document.getElementById('btn-start').addEventListener('click', async () => {
    mode = 'solo';
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    setupLocalGame(false);
    await audio.resume();
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    canvas.focus();
    startLoop();
  });

  document.getElementById('btn-continue').addEventListener('click', async () => {
    if (!GameState.hasSave()) return;
    mode = 'solo';
    document.getElementById('menu-screen').classList.add('hidden');
    setupLocalGame(true);
    await audio.resume();
    document.getElementById('hud').classList.remove('hidden');
    canvas.focus();
    startLoop();
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('settings-screen').classList.remove('hidden');
  });
  document.getElementById('btn-settings-back').addEventListener('click', () => {
    document.getElementById('settings-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
  });

  document.getElementById('btn-multi').addEventListener('click', () => {
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('multi-screen').classList.remove('hidden');
  });
  document.getElementById('btn-multi-back').addEventListener('click', () => {
    document.getElementById('multi-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
  });

  document.getElementById('btn-host').addEventListener('click', async () => {
    try {
      const code = genRoomCode();
      room = new MultiplayerRoom(code, true);
      // use profile name in join
      await room.create();
      // patch name after join
      await room.writePlayer({
        position: { x: 0, y: 1.7, z: 8 },
        rotation: { yaw: 0 },
        alive: true,
        health: 100,
      });
      // force name in firebase
      const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js');
      const { getDb } = await import('./net/firebase.js');
      await update(ref(getDb(), `rooms/${code}/players/${room.uid}`), {
        name: profile.displayName,
      });
      enterLobby();
    } catch (e) {
      alert('Failed to create room: ' + (e.message || e));
    }
  });

  document.getElementById('btn-join').addEventListener('click', async () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) return alert('Enter room code');
    try {
      room = new MultiplayerRoom(code, false);
      await room.join();
      const { ref, update } = await import('https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js');
      const { getDb } = await import('./net/firebase.js');
      await update(ref(getDb(), `rooms/${code}/players/${room.uid}`), {
        name: profile.displayName,
      });
      enterLobby();
    } catch (e) {
      alert(e.message || 'Join failed');
    }
  });

  document.getElementById('btn-copy-code').addEventListener('click', async () => {
    const code = document.getElementById('lobby-code').textContent;
    try {
      await navigator.clipboard.writeText(code);
      document.getElementById('btn-copy-code').textContent = 'Copied!';
      setTimeout(() => { document.getElementById('btn-copy-code').textContent = 'Copy code'; }, 1500);
    } catch {
      prompt('Copy code:', code);
    }
  });

  document.getElementById('btn-start-multi').addEventListener('click', async () => {
    if (!room || !room.isHost) return;
    try {
      await room.setStarted(true);
      await beginMultiGame();
    } catch (e) {
      alert('Failed to start: ' + (e.message || e));
    }
  });

  document.getElementById('btn-lobby-leave').addEventListener('click', () => {
    if (room) { room.dispose(); room = null; }
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('multi-screen').classList.remove('hidden');
  });

  document.getElementById('btn-restart').addEventListener('click', () => {
    document.getElementById('gameover-screen').classList.add('hidden');
    running = false;
    hideTouch();
    mode = 'solo';
    setupLocalGame(false);
    document.getElementById('hud').classList.remove('hidden');
    startLoop();
  });
  document.getElementById('btn-menu').addEventListener('click', () => {
    running = false;
    hideTouch();
    if (room) { room.dispose(); room = null; }
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    refreshContinueBtn();
  });

  document.getElementById('vol-master').addEventListener('input', (e) => {
    audio.setMasterVolume(Number(e.target.value));
  });
  document.getElementById('vol-sfx').addEventListener('input', (e) => {
    audio.setSfxVolume(Number(e.target.value));
  });
}

function showGameOver(win) {
  running = false;
  hideTouch();
  document.exitPointerLock?.();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('gameover-screen').classList.remove('hidden');
  document.getElementById('go-title').textContent = win ? 'YOU ESCAPED' : 'YOU DIED';
  document.getElementById('go-sub').textContent = win
    ? 'Survived the forest.'
    : 'The forest claimed another soul.';
  if (mode === 'solo') {
    state.saveLocal();
    refreshContinueBtn();
  }
}



function updateProximityUI(dist) {
  const el = document.getElementById('danger-overlay');
  const bpmEl = document.getElementById('heart-bpm');
  const icon = document.getElementById('heart-icon');
  const distEl = document.getElementById('monster-dist');
  const { bpm, danger, near } = heartFromDistance(dist);
  lastNearDist = dist;

  if (distEl) {
    if (Number.isFinite(dist) && dist < 40) {
      distEl.textContent = dist < 2 ? 'VERY CLOSE' : dist.toFixed(1) + ' m';
      distEl.style.color = dist < 6 ? '#c44' : dist < 14 ? '#c9a227' : 'rgba(180,170,160,0.7)';
    } else {
      distEl.textContent = '';
    }
  }

  if (bpmEl) bpmEl.textContent = String(Math.round(bpm));

  if (el) {
    const op = danger;
    el.style.setProperty('--danger-op', String(0.25 + op * 0.75));
    el.style.opacity = String(op * 0.95);
    if (op > 0.55) el.classList.add('pulse');
    else el.classList.remove('pulse');
  }

  // schedule heartbeats by BPM
  return bpm;
}

function tickHeartbeat(dt, bpm, danger) {
  if (!audio || bpm < 60) return;
  const interval = 60 / bpm;
  heartAcc += dt;
  if (heartAcc >= interval) {
    heartAcc -= interval;
    const vol = 0.08 + danger * 0.35;
    audio.playHeartbeat(vol);
    const icon = document.getElementById('heart-icon');
    if (icon) {
      icon.classList.remove('beat');
      void icon.offsetWidth;
      icon.classList.add('beat');
    }
  }
}

function startLoop() {
  if (running) return;
  running = true;
  function frame() {
    if (!running) return;
    const dt = clock.tick();
    const now = performance.now() / 1000;
    const isAuthority = mode === 'solo' || (room && room.isHost);

    player.update(dt);

    if (isAuthority) {
      for (const m of monsters) m.update(dt, now);
    } else if (room) {
      const rm = room.remoteMonsters;
      state.data.monsters.forEach((m, i) => {
        const id = m.id || `m${i}`;
        const r = rm[id];
        if (!r) return;
        m.position.x = r.x; m.position.y = r.y; m.position.z = r.z;
        m.rotation.yaw = r.yaw;
        m.aiState = r.aiState;
        m.memory.suspicion = r.suspicion || 0;
      });

      // Apply host-written health to local player (non-host clients)
      if (room && !room.isHost && room.remotePlayers[room.uid]) {
        const me = room.remotePlayers[room.uid];
        if (typeof me.health === 'number') {
          state.data.player.health = me.health;
          state.data.player.alive = me.alive !== false;
          if (!state.data.player.alive) {
            state.data.progress.gameOver = true;
            state.data.progress.win = false;
          }
        }
      }

      if (room.gameStatus.gameOver) {
        state.data.progress.gameOver = true;
        state.data.progress.win = !!room.gameStatus.win;
      }
    }

    state.data.world.activeSoundEvents = state.data.world.activeSoundEvents.filter(
      (e) => now - e.timestamp < 3
    );
    state.data.progress.playTime = clock.elapsed;

    if (mode === 'solo' && !state.data.progress.gameOver && state.data.player.alive && clock.elapsed >= ESCAPE_TIME) {
      state.data.progress.gameOver = true;
      state.data.progress.win = true;
    }

    if (state.data.progress.gameOver) {
      showGameOver(state.data.progress.win);
      if (room && room.isHost) room.writeGame(state.data.progress);
      return;
    }

    if (mode === 'solo' && Math.floor(clock.elapsed) % 20 === 0 && dt > 0 && Math.random() < dt) {
      state.saveLocal();
      refreshContinueBtn();
    }

    if (room) {
      netWriteAcc += dt;
      if (netWriteAcc >= 0.1) {
        netWriteAcc = 0;
        room.writePlayer(state.data.player);
        // ensure name on write
        if (room.remotePlayers[room.uid]) {
          /* name already set */
        }
        if (room.isHost) {
          room.writeMonsters(state.data.monsters);
          room.writeGame(state.data.progress);
        }
        const last = state.data.world.activeSoundEvents.at(-1);
        if (last && now - last.timestamp < 0.15) room.writeSound(last);
      }
      if (room.isHost) {
        for (const s of room.remoteSounds) {
          if (!s || performance.now() - (s.t || 0) > 2000) continue;
          state.data.world.activeSoundEvents.push({
            id: 'net_' + s.t,
            position: { x: s.x, y: s.y || 0, z: s.z },
            intensity: s.intensity || 0.4,
            radius: s.radius || 14,
            type: s.type || 'footstep',
            timestamp: now,
          });
        }
      }
      const active = new Set();
      for (const [uid, p] of Object.entries(room.remotePlayers)) {
        active.add(uid);
        renderer.syncRemotePlayer(uid, {
          ...p,
          name: p.name || profile.displayName,
        }, room.uid);
      }
      renderer.pruneRemotePlayers(active);
    }

    const hp = document.getElementById('health-fill');
    if (hp) hp.style.width = `${state.data.player.health}%`;

    const eye = player.eyePosition;
    const yaw = state.data.player.rotation.yaw;
    audio.setListenerPosition(eye.x, eye.y, eye.z, -Math.sin(yaw), -Math.cos(yaw));
    const { dist: mDist } = nearestMonsterDist(state.data.player.position, state.data.monsters);
    const { bpm, danger } = heartFromDistance(mDist);
    updateProximityUI(mDist);
    tickHeartbeat(dt, bpm, danger);
    renderer.render(state.data, eye, yaw, state.data.player.rotation.pitch);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

init().catch((err) => {
  console.error(err);
  const el = document.getElementById('login-error') || document.getElementById('login-screen');
  if (el) {
    const p = document.createElement('p');
    p.style.color = '#c44';
    p.textContent = 'Error: ' + (err.message || err);
    (document.getElementById('login-screen') || el).appendChild(p);
  }
});
