// Keyboard and mouse input for Golden Hour. Held keys are read as a state snapshot each
// frame; one-shot presses (interact, confirm) are latched until the game takes them, so a
// tap between two frames is never lost and never counted twice. Dragging the mouse orbits
// the chase camera around Rui or his car.

const HELD = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
};

export function createInput(canvas) {
  const down = new Set();
  let interactQueued = false;
  let confirmQueued = false;
  let dragging = false;
  let lastX = 0;
  let orbitDelta = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat) interactQueued = true;
    if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat) confirmQueued = true;
    down.add(event.code);
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => { down.delete(event.code); });
  window.addEventListener('blur', () => { down.clear(); dragging = false; });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    confirmQueued = true;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitDelta += (event.clientX - lastX) * 0.005;
    lastX = event.clientX;
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  const any = (codes) => codes.some((c) => down.has(c));

  return {
    forward() { return any(HELD.forward); },
    back() { return any(HELD.back); },
    left() { return any(HELD.left); },
    right() { return any(HELD.right); },
    run() { return any(HELD.run); },
    /** Steering as -1 (left), 0 or 1 (right). */
    steer() { return (any(HELD.right) ? 1 : 0) - (any(HELD.left) ? 1 : 0); },
    /** Throttle axis as -1 (reverse/brake), 0 or 1 (accelerate). */
    throttle() { return (any(HELD.forward) ? 1 : 0) - (any(HELD.back) ? 1 : 0); },
    takeInteract() { const v = interactQueued; interactQueued = false; return v; },
    takeConfirm() { const v = confirmQueued; confirmQueued = false; return v; },
    takeOrbit() { const v = orbitDelta; orbitDelta = 0; return v; },
  };
}
