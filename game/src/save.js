// Golden Hour's browser save (P1-D): one localStorage record holding the
// chain position and the Vela's upgrades — money, missionIdx, completed and
// upgrades {paint, tune, bumper}. Nothing else is persisted: a reload
// restarts the current mission from its accept point (missions.js's
// applySave documents that).
//
// Staging inertness is by construction: storing is gated behind a module
// flag that starts OFF, and main.js calls setSaveEnabled(true) only in the
// runGame path, after loading. The ?shot path never enables and never
// loads, so a staged capture can neither read nor write a save. Under Node
// (the sims) localStorage does not exist and every call is a safe no-op.

const KEY = 'goldenhour.portolume.v1';

let enabled = false;

/** Arm or disarm storing. Loading and clearing work regardless of the flag. */
export function setSaveEnabled(b) {
  enabled = !!b;
}

/** Read and loosely validate the stored save, or null when there is none worth trusting. */
export function loadSave() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    if (typeof o.money !== 'number' || typeof o.missionIdx !== 'number' || typeof o.completed !== 'number') return null;
    if (!o.upgrades || typeof o.upgrades !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

/** Persist the chain state (no-op unless storing was enabled by main.js). */
export function storeSave(G) {
  if (!enabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: 1,
      money: G.money,
      missionIdx: G.missionIdx,
      completed: G.completed,
      upgrades: { paint: G.upgrades.paint, tune: G.upgrades.tune, bumper: G.upgrades.bumper },
    }));
  } catch {
    // A full or blocked store must never break the game.
  }
}

/** Delete the save (the title screen's R reset). Works regardless of the flag. */
export function clearSave() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear against a blocked store.
  }
}
