/**
 * Auto orientation detection + layout hooks.
 */
export function isLandscape() {
  if (screen.orientation?.type) {
    return screen.orientation.type.startsWith('landscape');
  }
  return window.innerWidth > window.innerHeight;
}

export function isPortrait() {
  return !isLandscape();
}

/**
 * @param {(info: { landscape: boolean, width: number, height: number }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onOrientationChange(cb) {
  const fire = () => {
    cb({
      landscape: isLandscape(),
      width: window.innerWidth,
      height: window.innerHeight,
      angle: screen.orientation?.angle ?? 0,
    });
  };

  window.addEventListener('resize', fire);
  window.addEventListener('orientationchange', fire);
  if (screen.orientation) {
    screen.orientation.addEventListener('change', fire);
  }
  // initial
  fire();

  return () => {
    window.removeEventListener('resize', fire);
    window.removeEventListener('orientationchange', fire);
    if (screen.orientation) {
      screen.orientation.removeEventListener('change', fire);
    }
  };
}

export function updateRotateHint() {
  const hint = document.getElementById('rotate-hint');
  if (!hint) return;
  const mobile =
    'ontouchstart' in window ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  // Only force landscape hint on small/touch devices
  if (mobile && isPortrait() && Math.min(window.innerWidth, window.innerHeight) < 600) {
    hint.style.display = 'flex';
  } else {
    hint.style.display = 'none';
  }
  document.body.classList.toggle('is-landscape', isLandscape());
  document.body.classList.toggle('is-portrait', isPortrait());
}

export function tryLandscapeLock() {
  try {
    const o = screen.orientation;
    if (o && typeof o.lock === 'function') {
      return o.lock('landscape').catch(() => false);
    }
  } catch {
    /* ignore */
  }
  return Promise.resolve(false);
}
