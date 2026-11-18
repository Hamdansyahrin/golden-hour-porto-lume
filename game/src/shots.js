// Deterministic screenshot staging for Golden Hour. Each scene is assembled by hand —
// fixed positions, fixed headings, fixed wanted level — from the same seeded city every
// other run builds, then the real game systems settle it for a fixed number of steps.
// No clock, no randomness: the same ?shot= name always frames the same Porto Lume.
//
//   ?shot=boxin    SHOT 1, the cover: the PMPL box-in on Avenida do Farol.
//   ?shot=foot     on foot at the festival stalls, the lift about to happen.
//   ?shot=deliver  the delivery at Dona Pilar's garage, job done.

import { WORLD, headingTo } from './city.js';
import { STAGE } from './missions.js';
import { setCameraLook } from './player.js';

function placeCar(car, x, z, heading, speed = 0) {
  car.x = x; car.z = z; car.heading = heading; car.speed = speed;
}

/**
 * Pin the P1-A traffic cars (indices 5+) onto far-away waypoints of their own routes,
 * so the expanded fleet never wanders into a staged frame during the settle steps.
 * Each car is placed exactly on its route with its target set to the next waypoint,
 * so the settle drives it along its own street, deterministically, far from camera.
 */
function parkExtraTraffic(G) {
  const spots = [[5, 4], [6, 8], [7, 6], [8, 10], [9, 0], [10, 4], [11, 10], [12, 6]];
  for (const [i, wp] of spots) {
    const car = G.traffic[i];
    if (!car) continue;
    const [x, z] = car.route[wp];
    const [nx, nz] = car.route[(wp + 1) % car.route.length];
    placeCar(car, x, z, headingTo(nx - x, nz - z), 0);
    car.wp = (wp + 1) % car.route.length;
  }
}
function placePed(ped, x, z, heading, state = 'walk') {
  ped.x = x; ped.z = z; ped.heading = heading; ped.state = state;
  ped.walkPhase = (x * 7 + z * 13) % 6;
}

/** Set G to the named scene and run the fixed settle steps through `step`. */
export function stageShot(G, name, step) {
  G.screen = 'play';
  if (name === 'foot') return stageFoot(G, step);
  if (name === 'deliver') return stageDeliver(G, step);
  return stageBoxin(G, step);
}

function settle(G, step, seconds) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) step(1 / 60);
}

// SHOT 1 — the box-in: Rui's Vela on the boulevard, the PMPL car angled across its nose,
// traffic held up behind, pedestrians watching from the sidewalks, CALOR at 3 stars, the
// delivery objective on the mission card and every blip on the minimap.
function stageBoxin(G, step) {
  G.stage = STAGE.DELIVER;
  G.carrying = true;
  G.wanted = 3;
  G.money = 120;
  G.player.mode = 'car';
  placeCar(G.playerCar, 6, 3.6, -Math.PI / 2, 6);
  G.player.x = 6; G.player.z = 3.6; G.player.heading = -Math.PI / 2;
  // The patrol angled in front of the Vela's nose, lights on.
  placeCar(G.police, 13.5, 1.2, -Math.PI / 2 - 0.62, 0);
  // Traffic: one car held behind Rui, one coming the other way, one up the side street.
  placeCar(G.traffic[0], -8, 3.6, -Math.PI / 2, 0);
  placeCar(G.traffic[1], 30, -3.6, Math.PI / 2, 5);
  placeCar(G.traffic[2], 17.6, -14, Math.PI, 4);
  placeCar(G.traffic[3], -20, -3.6, Math.PI / 2, 6);
  placeCar(G.traffic[4], 22.4, 20, 0, 4);
  parkExtraTraffic(G);
  // Pedestrians on both sidewalks, two of them mid-flee from the screech of brakes.
  placePed(G.peds[0], -2, 8.8, Math.PI / 2);
  placePed(G.peds[1], 16, 8.8, -Math.PI / 2, 'flee');
  placePed(G.peds[2], 24, -8.8, Math.PI / 2);
  placePed(G.peds[3], -12, -8.8, -Math.PI / 2);
  placePed(G.peds[4], 34, 8.8, Math.PI / 2);
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“Fecha a avenida. O Vela é nosso — LUME-1 a bloquear.”', until: 1e9 };
  G.seen = true;
  settle(G, step, 0.35);
  // Re-pin the principals after the settle so the frame is exact.
  placeCar(G.playerCar, 6, 3.6, -Math.PI / 2, 6);
  placeCar(G.police, 13.5, 1.2, -Math.PI / 2 - 0.62, 0);
  G.wanted = 3; G.stage = STAGE.DELIVER; G.carrying = true; G.money = 120;
  G.player.mode = 'car'; G.player.x = 6; G.player.z = 3.6;
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“Fecha a avenida. O Vela é nosso — LUME-1 a bloquear.”', until: 1e9 };
  G.seen = true;
  setCameraLook(G, -4.6, 3.3, 5.2, 11, 1.0, 2.0);
}

// SHOT 2 — on foot in Rua das Flores: Rui at the festival stalls, the gold package on the
// middle banca, the keeper watching, pedestrians strolling, CALOR still calm.
function stageFoot(G, step) {
  G.stage = STAGE.GO;
  G.wanted = 0;
  G.money = 35;
  G.player.mode = 'foot';
  G.player.x = 23.4; G.player.z = 8.2; G.player.heading = Math.PI * 0.78;
  placeCar(G.playerCar, WORLD.playerCar.x, WORLD.playerCar.z, WORLD.playerCar.heading, 0);
  placeCar(G.police, -30, -3.6, Math.PI / 2, 5);
  placeCar(G.traffic[0], -14, 3.6, -Math.PI / 2, 6);
  placeCar(G.traffic[1], 44, -3.6, Math.PI / 2, 6);
  placeCar(G.traffic[2], 17.6, -26, Math.PI, 5);
  parkExtraTraffic(G);
  placePed(G.peds[0], 24.7, 2, Math.PI);
  placePed(G.peds[1], 24.7, 17, 0);
  placePed(G.peds[2], 13.9, 4, 0);
  placePed(G.peds[3], -6, 8.8, -Math.PI / 2);
  settle(G, step, 0.3);
  G.player.x = 23.4; G.player.z = 8.2; G.player.heading = Math.PI * 0.78;
  G.wanted = 0; G.stage = STAGE.GO; G.money = 35;
  G.prompt = '<b>E</b> — levantar o pacote da banca';
  setCameraLook(G, 18.6, 2.9, 1.8, 24.6, 1.3, 10.5);
}

// SHOT 3 — the delivery: the Vela nosed into the garage apron at golden hour, Rui at the
// door with the job-done card up, the patrol standing down down the avenue.
function stageDeliver(G, step) {
  G.stage = STAGE.FREE;
  G.carrying = false;
  G.money = 570;
  G.wanted = 0;
  G.cooldownT = 3;
  G.player.mode = 'foot';
  G.player.x = 51.5; G.player.z = 10.8; G.player.heading = Math.PI * 0.15;
  placeCar(G.playerCar, 57.5, 8.6, -Math.PI / 2 + 0.25, 0);
  placeCar(G.police, 88, -3.6, Math.PI / 2, 4);
  placeCar(G.traffic[0], 20, 3.6, -Math.PI / 2, 7);
  placeCar(G.traffic[1], -18, -3.6, Math.PI / 2, 7);
  placeCar(G.traffic[2], 17.6, 24, Math.PI, 5);
  parkExtraTraffic(G);
  placePed(G.peds[0], 46, 8.8, -Math.PI / 2);
  placePed(G.peds[1], 63, 8.8, Math.PI / 2);
  placePed(G.peds[3], 40, -8.8, -Math.PI / 2);
  settle(G, step, 0.3);
  G.player.x = 51.5; G.player.z = 10.8; G.player.heading = Math.PI * 0.15;
  G.stage = STAGE.FREE; G.money = 570; G.wanted = 0; G.cooldownT = 3;
  G.screen = 'done';
  setCameraLook(G, 37.5, 4.6, -1.5, 57, 1.2, 12.5);
}
