import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WORLD, tileSeed } from '../core/WorldConfig.js';
import { recommendGraphics } from '../core/Device.js';

export class Renderer {
  constructor() {
    this.backend = 'webgl2';
    this._THREE = THREE;
    this.monsterMeshes = [];
    this.monsterTemplate = null;
    this.playerTemplate = null;
    this.nameSprites = new Map(); // key -> sprite
    this.remoteMeshes = {};
  }

  async init(canvas) {
    this._THREE = THREE;
    const gfx = recommendGraphics();
    this.gfx = gfx;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !gfx.touch,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, gfx.pixelRatioCap));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.setClearColor(0x07080a);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = gfx.shadows;
    if (gfx.shadows) this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0d10, gfx.fogDensity);
    this.scene.background = new THREE.Color(0x07080a);

    this.camera = new THREE.PerspectiveCamera(
      72,
      canvas.clientWidth / canvas.clientHeight,
      0.15,
      180
    );

    // Flashlight: strong spot + near fill (dark forest needs high intensity)
    this.flashlight = new THREE.SpotLight(0xfff4e0, 0, 45, Math.PI / 5, 0.25, 1.0);
    this.flashlight.castShadow = false;
    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.scene.add(this.flashlight);
    this.flashlightFill = new THREE.PointLight(0xffe8c8, 0, 8, 2);
    this.scene.add(this.flashlightFill);

    const groundGeo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 32, 32);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.15) * Math.cos(y * 0.12) * 0.35);
    }
    groundGeo.computeVertexNormals();
    this.ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({ color: 0x1a1f16, roughness: 0.95 })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.treeGroup = new THREE.Group();
    this.rockGroup = new THREE.Group();
    this.buildForest();
    this.scene.add(this.treeGroup);
    this.scene.add(this.rockGroup);

    this.ambientLight = new THREE.AmbientLight(0x3a4038, 0.45);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xfff0c8, 0.85);
    this.sunLight.position.set(40, 60, 20);
    this.sunLight.castShadow = gfx.shadows;
    this.scene.add(this.sunLight);

    // Load GLB models
    const loader = new GLTFLoader();
    try {
      const monGltf = await loader.loadAsync('./assets/monster.glb');
      this.monsterTemplate = monGltf.scene;
      this.monsterTemplate.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = gfx.shadows;
          c.receiveShadow = gfx.shadows;
        }
      });
    } catch (e) {
      console.warn('monster.glb failed', e);
      this.monsterTemplate = this._fallbackMonster();
    }
    try {
      const plGltf = await loader.loadAsync('./assets/player.glb');
      this.playerTemplate = plGltf.scene;
      this.playerTemplate.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = gfx.shadows;
          c.receiveShadow = gfx.shadows;
        }
      });
    } catch (e) {
      console.warn('player.glb failed', e);
      this.playerTemplate = this._fallbackPlayer();
    }

    // Single monster
    {
      const m = this.monsterTemplate.clone(true);
      m.traverse((c) => {
        if (c.isMesh && c.material) c.material = c.material.clone();
      });
      this.scene.add(m);
      this.monsterMeshes.push(m);
      this._attachNameTag(m, '???', 'monster-0');
    }
  }

  _fallbackMonster() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 1.8, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x120808, emissive: 0x1a0000, emissiveIntensity: 0.35 })
    );
    g.add(body);
    return g;
  }

  _fallbackPlayer() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.0, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x446688 })
    ));
    return g;
  }

  _makeNameSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(20, 12, 216, 40);
    ctx.fillStyle = '#e8e0d5';
    ctx.fillText(text.slice(0, 16), 128, 40);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(2.2, 0.55, 1);
    spr.position.y = 3.2;
    spr.userData.canvas = canvas;
    spr.userData.ctx = ctx;
    spr.userData.tex = tex;
    return spr;
  }

  _attachNameTag(root, name, key) {
    let spr = this.nameSprites.get(key);
    if (spr) {
      this._updateNameSprite(spr, name);
      return spr;
    }
    spr = this._makeNameSprite(name);
    root.add(spr);
    this.nameSprites.set(key, spr);
    return spr;
  }

  _updateNameSprite(spr, name) {
    const ctx = spr.userData.ctx;
    const canvas = spr.userData.canvas;
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 28px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(20, 12, 216, 40);
    ctx.fillStyle = '#e8e0d5';
    ctx.fillText(String(name).slice(0, 16), 128, 40);
    spr.userData.tex.needsUpdate = true;
  }

  buildForest() {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 5.5, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.95 });
    const crownGeo = new THREE.ConeGeometry(1.6, 4.2, 6);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x0f1a0c, roughness: 0.9 });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.88 });
    const half = WORLD.half;
    const ts = WORLD.tileSize;
    const shadows = this.gfx.shadows;

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
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.set(x, 2.75 * scale, z);
          trunk.scale.setScalar(scale);
          trunk.castShadow = shadows;
          this.treeGroup.add(trunk);
          const crown = new THREE.Mesh(crownGeo, crownMat);
          crown.position.set(x, 5.2 * scale, z);
          crown.scale.setScalar(scale);
          crown.castShadow = shadows;
          this.treeGroup.add(crown);
        }
        const rockCount = 1 + Math.floor(tileSeed(tx, tz, 99) * 3);
        for (let i = 0; i < rockCount; i++) {
          const sx = tileSeed(tx, tz, 200 + i * 2);
          const sz = tileSeed(tx, tz, 201 + i * 2);
          const x = ox + (sx - 0.5) * (ts - 3);
          const z = oz + (sz - 0.5) * (ts - 3);
          if (Math.hypot(x, z) < 5) continue;
          const rock = new THREE.Mesh(rockGeo, rockMat);
          const sc = 0.6 + tileSeed(tx, tz, 300 + i) * 1.4;
          rock.position.set(x, 0.4 * sc, z);
          rock.scale.setScalar(sc);
          rock.rotation.set(sx * 2, sz * 3, sx);
          rock.castShadow = shadows;
          this.rockGroup.add(rock);
        }
      }
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** Update or create remote player mesh + name tag */
  syncRemotePlayer(uid, data, myUid) {
    if (uid === myUid) return;
    let mesh = this.remoteMeshes[uid];
    if (!mesh && this.playerTemplate) {
      mesh = this.playerTemplate.clone(true);
      mesh.traverse((c) => {
        if (c.isMesh && c.material) c.material = c.material.clone();
      });
      this.scene.add(mesh);
      this.remoteMeshes[uid] = mesh;
      this._attachNameTag(mesh, data.name || 'Player', 'p-' + uid);
    }
    if (!mesh) return;
    const footY = (data.footY != null)
      ? data.footY
      : ((data.y || 1.7) - 1.7);
    mesh.position.set(data.x, footY, data.z);
    mesh.rotation.y = data.yaw || 0;
    mesh.visible = data.alive !== false;
    const spr = this.nameSprites.get('p-' + uid);
    if (spr) this._updateNameSprite(spr, data.name || 'Player');
  }

  pruneRemotePlayers(activeUids) {
    for (const uid of Object.keys(this.remoteMeshes)) {
      if (!activeUids.has(uid)) {
        this.scene.remove(this.remoteMeshes[uid]);
        this.nameSprites.delete('p-' + uid);
        delete this.remoteMeshes[uid];
      }
    }
  }

  applyDayLighting(light) {
    if (!light) return;
    if (this.ambientLight) {
      this.ambientLight.color.setHex(light.ambient);
      this.ambientLight.intensity = light.ambientInt;
    }
    if (this.sunLight) {
      this.sunLight.color.setHex(light.sun);
      this.sunLight.intensity = light.sunInt;
      // sun lowers toward horizon as night approaches
      const h = 20 + light.sunInt * 50;
      this.sunLight.position.set(40, h, 20);
    }
    if (this.scene.fog) {
      this.scene.fog.color.setHex(light.fog);
      this.scene.fog.density = light.fogDensity;
    }
    this.renderer.setClearColor(light.clear);
    if (this.scene.background) this.scene.background.setHex(light.clear);
  }


  render(state, eye, yaw, pitch) {
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = yaw;
    this.camera.rotation.x = pitch;

    // Flashlight follows look direction
    if (this.flashlight) {
      const on = !!(state.player && state.player.flashlight);
      // High intensity to cut through fog + dark materials
      this.flashlight.intensity = on ? 12 : 0;
      this.flashlight.distance = 50;
      this.flashlight.position.copy(this.camera.position);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.flashlightTarget.position.copy(this.camera.position).addScaledVector(dir, 18);
      this.flashlight.target.updateMatrixWorld();
      if (this.flashlightFill) {
        this.flashlightFill.intensity = on ? 2.5 : 0;
        this.flashlightFill.position.copy(this.camera.position);
      }
    }

    state.monsters.forEach((mon, i) => {
      const mesh = this.monsterMeshes[i];
      if (!mesh) return;
      mesh.position.set(mon.position.x, mon.position.y || 0, mon.position.z);
      mesh.rotation.y = mon.rotation.yaw;
      const label = mon.aiState === 'CHASE' ? '!!!' : mon.aiState === 'PATROL' ? '…' : '?';
      const spr = this.nameSprites.get('monster-' + i);
      if (spr) this._updateNameSprite(spr, label);
    });

    this.renderer.render(this.scene, this.camera);
  }
}
