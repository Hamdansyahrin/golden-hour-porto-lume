// Golden Hour — boot and the one game loop. The city is built once from its fixed seed,
// the world advances in fixed 1/60 s steps whatever the display rate, and the renderer
// paints the static city plus the actors rebuilt each frame. Screens: title, play,
// detained (busted) and job-done, all over the live 3D scene.
//
// ?shot=boxin|foot|deliver (with &seed=N) stages a deterministic scene instead of running
// the loop, paints it twice and sets window.__shotReady for the screenshot harness —
// see shots.js and shots.json. The staging path never reads the clock or Math.random.

import { createCity } from './city.js';
import { createRenderer, MeshBuilder } from './engine.js';
import { createInput } from './input.js';
import { createGameState, updateMission } from './missions.js';
import { updatePlayer, setCameraLook } from './player.js';
import { paintCar, paintPerson, paintMarker, paintHeli, updateTraffic, updatePolice, updatePeds, updateHeli, collideCars } from './actors.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('gl');
const city = createCity();
const renderer = createRenderer(canvas);
renderer.initStatic(city.builder);
const G = createGameState(city.colliders);
const hud = createHud();
const minimap = createMinimap(document.getElementById('minimap'));
const dyn = new MeshBuilder();

/** Rebuild the dynamic geometry (every actor) and paint one frame. */
function paint() {
  dyn.clear();
  const flash = Math.floor(G.time * 2.4) % 2 === 0;
  for (const car of G.traffic) paintCar(dyn, car, flash);
  for (const cop of G.policeUnits) paintCar(dyn, cop, flash);
  paintCar(dyn, G.playerCar, flash);
  paintHeli(dyn, G.heli);
  for (const ped of G.peds) paintPerson(dyn, ped);
  if (G.player.mode === 'foot') paintPerson(dyn, G.player);
  if (G.markerX !== null && G.markerX !== undefined && G.screen === 'play') paintMarker(dyn, G.markerX, G.markerZ, G.time);
  renderer.draw(G.camera, dyn);
  hud.update(G);
  minimap.draw(G);
  // Read-only debug/state hook for playtest verification (alongside __shotReady):
  // a plain snapshot of where Rui is and what the game thinks is happening. The
  // game never reads it back; it exists so a human or a test harness driving a
  // real browser can confirm state without scraping pixels. P1-B extends it with
  // the full CALOR/LOS/fleet/heli picture a validator needs (plain reads only).
  const r2 = (v) => Math.round(v * 100) / 100;
  window.__ghState = {
    x: G.player.x, z: G.player.z, heading: G.player.heading,
    inVehicle: G.player.mode === 'car',
    speed: G.player.mode === 'car' ? G.playerCar.speed : G.player.speed,
    wanted: G.wanted, seen: !!G.seen, stage: G.stage, money: G.money,
    screen: G.screen, time: G.time,
    calor: G.wanted,
    losState: {
      vista: !!G.seen,
      foraDeVista: G.wanted > 0 && !G.seen,
      unseenSeconds: r2(G.unseenT),
    },
    police: G.policeUnits.map((u) => ({
      id: u.id, name: u.name, mode: u.mode, active: u.active,
      hasLOS: u.hasLOS,
      lastKnown: { x: r2(u.lastKnownX), z: r2(u.lastKnownZ) },
      x: r2(u.x), z: r2(u.z),
    })),
    roadblock: {
      active: G.roadblock.active,
      cx: r2(G.roadblock.cx), cz: r2(G.roadblock.cz),
    },
    heli: {
      active: G.heli.active, state: G.heli.state,
      position: { x: r2(G.heli.x), y: r2(G.heli.y), z: r2(G.heli.z) },
    },
    player: {
      pos: { x: r2(G.player.x), z: r2(G.player.z) },
      speed: r2(G.player.mode === 'car' ? G.playerCar.speed : G.player.speed),
      inVehicle: G.player.mode === 'car',
    },
    mission: { stage: G.stage, carrying: G.carrying, money: G.money },
  };
}

/** One fixed simulation step of the whole world (no rendering). */
function stepWorld(dt, input) {
  G.time += dt;
  if (G.screen === 'play') {
    // One E press, one action: if the car took the press, the mission must not
    // spend it a second time in the same step.
    if (updatePlayer(G, input, dt)) G.interactPressed = false;
  }
  updateTraffic(G, dt);
  updatePolice(G, dt);
  updateHeli(G, dt);
  updatePeds(G, dt);
  collideCars(G, dt);
  updateMission(G, dt);
  G.interactPressed = false;
}

function runShot(name) {
  const frozenInput = {
    throttle: () => 0, steer: () => 0, run: () => false,
    takeOrbit: () => 0,
  };
  stageShot(G, name, (dt) => {
    G.time += dt;
    updateTraffic(G, dt);
    updatePolice(G, dt);
    updateHeli(G, dt);
    updatePeds(G, dt);
    collideCars(G, dt);
    updateMission(G, dt);
  });
  let painted = 0;
  function paintShot() {
    paint();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintShot);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintShot);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (input.takeConfirm()) {
      if (G.screen === 'title' || G.screen === 'busted' || G.screen === 'done') G.screen = 'play';
    }
    if (G.screen === 'title') {
      // A slow golden-hour drift over the boulevard toward the Farol while the card is up.
      G.time += 1 / 60;
      const t = G.time;
      setCameraLook(G, -4 + Math.cos(t * 0.05) * 9, 8.5, 1.5 + Math.sin(t * 0.05) * 2.5, 20, 1.5, -2);
      updateTraffic(G, 1 / 60);
      updatePeds(G, 1 / 60);
      accumulator = 0;
    } else {
      if (input.takeInteract()) G.interactPressed = true;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        stepWorld(STEP, input);
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === 5) accumulator = 0;
    }
    paint();
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
