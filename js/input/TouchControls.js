export class TouchControls {
  constructor(rootEl, keys, onLook) {
    this.keys = keys;
    this.onLook = onLook;
    this.active = false;
    this._lookId = null;
    this._lookLast = null;
    this._joyId = null;
    this._joyOrigin = { x: 0, y: 0 };

    this.el = document.createElement('div');
    this.el.id = 'touch-controls';
    this.el.innerHTML = `
      <div id="touch-joy-zone">
        <div id="touch-joy-base"><div id="touch-joy-knob"></div></div>
      </div>
      <div id="touch-look-zone"></div>
      <div id="touch-actions">
        <button type="button" id="touch-crouch" aria-label="Crouch">CROUCH</button>
        <button type="button" id="touch-run" aria-label="Run">RUN</button>
      </div>
    `;
    rootEl.appendChild(this.el);
    this.knob = this.el.querySelector('#touch-joy-knob');
    this.base = this.el.querySelector('#touch-joy-base');
    this.joyZone = this.el.querySelector('#touch-joy-zone');
    this.lookZone = this.el.querySelector('#touch-look-zone');
    this.btnRun = this.el.querySelector('#touch-run');
    this.btnCrouch = this.el.querySelector('#touch-crouch');
    this._bind();
  }

  show() { this.el.classList.add('visible'); this.active = true; }
  hide() {
    this.el.classList.remove('visible');
    this.active = false;
    this._clearMove();
  }

  _bind() {
    const prevent = (e) => e.preventDefault();
    this.joyZone.addEventListener('touchstart', (e) => {
      prevent(e);
      const t = e.changedTouches[0];
      this._joyId = t.identifier;
      const r = this.base.getBoundingClientRect();
      this._joyOrigin.x = r.left + r.width / 2;
      this._joyOrigin.y = r.top + r.height / 2;
      this._updateJoy(t.clientX, t.clientY);
    }, { passive: false });
    this.joyZone.addEventListener('touchmove', (e) => {
      prevent(e);
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) this._updateJoy(t.clientX, t.clientY);
      }
    }, { passive: false });
    this.joyZone.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) this._clearMove();
      }
    });
    this.joyZone.addEventListener('touchcancel', () => this._clearMove());

    this.lookZone.addEventListener('touchstart', (e) => {
      prevent(e);
      const t = e.changedTouches[0];
      this._lookId = t.identifier;
      this._lookLast = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    this.lookZone.addEventListener('touchmove', (e) => {
      prevent(e);
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId || !this._lookLast) continue;
        const dx = t.clientX - this._lookLast.x;
        const dy = t.clientY - this._lookLast.y;
        this._lookLast = { x: t.clientX, y: t.clientY };
        this.onLook(dx, dy);
      }
    }, { passive: false });
    this.lookZone.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookId) { this._lookId = null; this._lookLast = null; }
      }
    });

    const setKey = (code, on) => { if (on) this.keys.add(code); else this.keys.delete(code); };
    this.btnRun.addEventListener('touchstart', (e) => { prevent(e); setKey('ShiftLeft', true); this.btnRun.classList.add('active'); }, { passive: false });
    this.btnRun.addEventListener('touchend', () => { setKey('ShiftLeft', false); this.btnRun.classList.remove('active'); });
    this.btnRun.addEventListener('touchcancel', () => { setKey('ShiftLeft', false); this.btnRun.classList.remove('active'); });
    this.btnCrouch.addEventListener('touchstart', (e) => {
      prevent(e);
      if (this.keys.has('KeyC')) { this.keys.delete('KeyC'); this.btnCrouch.classList.remove('active'); }
      else { this.keys.add('KeyC'); this.btnCrouch.classList.add('active'); }
    }, { passive: false });
  }

  _updateJoy(cx, cy) {
    const max = 48;
    let dx = cx - this._joyOrigin.x;
    let dy = cy - this._joyOrigin.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max, ny = dy / max;
    this.keys.delete('KeyW'); this.keys.delete('KeyS'); this.keys.delete('KeyA'); this.keys.delete('KeyD');
    if (ny < -0.3) this.keys.add('KeyW');
    if (ny > 0.3) this.keys.add('KeyS');
    if (nx < -0.3) this.keys.add('KeyA');
    if (nx > 0.3) this.keys.add('KeyD');
  }

  _clearMove() {
    this._joyId = null;
    this.knob.style.transform = 'translate(0,0)';
    this.keys.delete('KeyW'); this.keys.delete('KeyS'); this.keys.delete('KeyA'); this.keys.delete('KeyD');
  }
}
