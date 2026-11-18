// Deterministic screenshot staging for Golden Hour. Each scene is assembled by hand —
// fixed positions, fixed headings, fixed wanted level — from the same seeded city every
// other run builds, then the real game systems settle it for a fixed number of steps.
// No clock, no randomness: the same ?shot= name always frames the same Porto Lume.
//
//   ?shot=boxin    SHOT 1, the cover: the PMPL box-in on Avenida do Farol.
//   ?shot=foot     on foot at the festival stalls, the lift about to happen.
//   ?shot=deliver  the delivery at Dona Pilar's garage, job done.
//   ?shot=roadblock  P1-B: the 4-star blockade formed across the boulevard.
//   ?shot=heli     P1-B cover candidate: 5 stars, ÁGUIA-1's spotlight, the
//                  roadblock ahead and the Farol closing the frame.

import { WORLD, headingTo } from './city.js';
import { STAGE } from './missions.js';
import { setCameraLook } from './player.js';
import { placeRoadblock } from './actors.js';

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
  if (name === 'roadblock') return stageRoadblock(G, step);
  if (name === 'heli') return stageHeli(G, step);
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
  // (P1-C recomposition, measured with the engine's own projection: the held car
  // used to sit at x=-8, BEHIND the old camera at x=-4.6 — claimed in this
  // comment, invisible in the frame. It now waits at x=-2.5 and the camera
  // pulls back to x=-7.5, so it reads as a foreground layer lower-left while
  // the Vela/LUME-1 pair keeps its centred confrontation.)
  placeCar(G.traffic[0], -2.5, 3.6, -Math.PI / 2, 0);
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
  setCameraLook(G, -7.5, 3.4, 6.2, 11.5, 0.9, 1.8);
}

// SHOT 4 — the roadblock: Rui's Vela eastbound on the boulevard at 4 stars, LUME-2 and
// LUME-4 already formed nose-to-tail across both lanes ahead (placed by the real
// placeRoadblock logic, then pinned on their slots), LUME-1 and LUME-3 closing in
// behind, the widened gap on the far side readable as the way through.
function stageRoadblock(G, step) {
  G.stage = STAGE.DELIVER;
  G.carrying = true;
  G.wanted = 4;
  G.money = 120;
  G.player.mode = 'car';
  placeCar(G.playerCar, 0, 3.6, -Math.PI / 2, 6);
  G.player.x = 0; G.player.z = 3.6; G.player.heading = -Math.PI / 2;
  // P1-C recomposition (measured, engine projection): both chasers used to sit
  // at x=-13/-19, behind or beside the old camera at x=-9 — the "closing in
  // behind" this shot promises was never in the frame. LUME-1 now runs 8 m
  // behind Rui in his lane and LUME-3 cuts across the oncoming lane 4 m back,
  // and the camera pulls to (-14, 4.2, 7): NDC puts LUME-1 lower-left
  // foreground (-0.38, -0.78), LUME-3 at the left edge (-0.82, -0.38), the
  // Vela low-centre and the blockade on the vanishing point.
  placeCar(G.policeUnits[0], -8, 3.6, -Math.PI / 2, 5);
  placeCar(G.policeUnits[2], -4, -3.6, -Math.PI / 2, 6);
  // The real placement: centre (30, 0) on the boulevard, blockers assigned.
  placeRoadblock(G, G.playerCar);
  for (const id of [1, 3]) {
    const u = G.policeUnits[id];
    placeCar(u, u.slotX, u.slotZ, u.slotHeading, 0);
  }
  placeCar(G.traffic[0], -26, 3.6, -Math.PI / 2, 0);
  placeCar(G.traffic[1], 44, -3.6, Math.PI / 2, 5);
  placeCar(G.traffic[2], 17.6, -14, Math.PI, 4);
  parkExtraTraffic(G);
  placePed(G.peds[0], -4, 8.8, Math.PI / 2);
  placePed(G.peds[1], 18, 8.8, -Math.PI / 2, 'flee');
  placePed(G.peds[2], 36, -8.8, Math.PI / 2);
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“Bloqueio formado na avenida. Ele que tente passar — LUME-2, LUME-4, aguentem.”', until: 1e9 };
  G.seen = true;
  settle(G, step, 0.35);
  // Re-pin the principals after the settle so the frame is exact.
  placeCar(G.playerCar, 0, 3.6, -Math.PI / 2, 6);
  placeCar(G.policeUnits[0], -8, 3.6, -Math.PI / 2, 5);
  placeCar(G.policeUnits[2], -4, -3.6, -Math.PI / 2, 6);
  placeRoadblock(G, G.playerCar);
  for (const id of [1, 3]) {
    const u = G.policeUnits[id];
    placeCar(u, u.slotX, u.slotZ, u.slotHeading, 0);
  }
  G.wanted = 4; G.stage = STAGE.DELIVER; G.carrying = true; G.money = 120;
  G.player.mode = 'car'; G.player.x = 0; G.player.z = 3.6;
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“Bloqueio formado na avenida. Ele que tente passar — LUME-2, LUME-4, aguentem.”', until: 1e9 };
  G.seen = true;
  setCameraLook(G, -14, 4.2, 7.0, 27, 0.9, -0.5);
}

// SHOT 5 — the P1-B cover candidate, Porto Lume's own composition: Rui westbound
// toward the Farol at 5 stars in the last of the light, two PMPL cars on his tail,
// ÁGUIA-1 up ahead with its spotlight cone raking down onto the Vela, the roadblock
// waiting at the far end of the boulevard, and the 21 m Farol closing the frame
// over the rooftops. HUD shows 5 stars + ÁGUIA-1 NO AR, minimap live.
//
// Recomposed after the first P1-B capture failed on pixels, not state: that
// camera sat on the south sidewalk at (-2, 3.5, 12), half a metre off the south
// row's building faces, so a brown wall filled the left 40% of the frame and
// ÁGUIA-1 — staged at 27 m, far up the sight line — clipped off the top edge,
// leaving only its cone, which read as a solid white sail. The camera now
// stands ON the boulevard itself, in the south lane east of the chase, with
// both building rows set well back at the frame edges; Rui runs at (-40, -3.6)
// and ÁGUIA-1 holds the same station live play uses — ahead of him and off his
// left shoulder, (-52, 24, -9.5), nose turned back toward him the way the live
// follow holds it — body and rotor fully inside the upper frame, cone slanting
// down to the Vela, the blockade at (-70, 0) and the Farol beyond it closing
// the right of the frame.
function stageHeli(G, step) {
  G.stage = STAGE.DELIVER;
  G.carrying = true;
  G.wanted = 5;
  G.money = 260;
  G.player.mode = 'car';
  placeCar(G.playerCar, -40, -3.6, Math.PI / 2, 9);
  G.player.x = -40; G.player.z = -3.6; G.player.heading = Math.PI / 2;
  placeCar(G.policeUnits[0], -30, -3.6, Math.PI / 2, 8);
  placeCar(G.policeUnits[2], -35, 3.6, Math.PI / 2, 7);
  // The blockade ahead, at the Farol end of the boulevard (real placement logic).
  placeRoadblock(G, G.playerCar);
  for (const id of [1, 3]) {
    const u = G.policeUnits[id];
    placeCar(u, u.slotX, u.slotZ, u.slotHeading, 0);
  }
  // ÁGUIA-1 on station ahead/above, spotlight pinned to the Vela.
  G.heli.forced = true;
  G.heli.state = 'active';
  G.heli.active = true;
  G.heli.x = -52; G.heli.y = 24; G.heli.z = -9.5;
  G.heli.heading = -1.11;
  G.heli.rotorVel = 30; G.heli.rotor = 2.2;
  G.heli.spotX = -40; G.heli.spotZ = -3.6;
  placeCar(G.traffic[0], 6, 3.6, -Math.PI / 2, 6);
  placeCar(G.traffic[1], 30, -3.6, Math.PI / 2, 5);
  parkExtraTraffic(G);
  placePed(G.peds[0], -30, 8.8, Math.PI / 2, 'flee');
  placePed(G.peds[1], -48, -8.8, -Math.PI / 2);
  placePed(G.peds[2], -18, -8.8, Math.PI / 2);
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“ÁGUIA-1 tem o Vela no holofote. Fecha a avenida junto ao Farol.”', until: 1e9 };
  G.seen = true;
  settle(G, step, 0.35);
  // Re-pin the principals (the settle lets the chase breathe a few metres).
  placeCar(G.playerCar, -40, -3.6, Math.PI / 2, 9);
  G.player.x = -40; G.player.z = -3.6; G.player.heading = Math.PI / 2;
  placeCar(G.policeUnits[0], -30, -3.6, Math.PI / 2, 8);
  placeCar(G.policeUnits[2], -35, 3.6, Math.PI / 2, 7);
  placeRoadblock(G, G.playerCar);
  for (const id of [1, 3]) {
    const u = G.policeUnits[id];
    placeCar(u, u.slotX, u.slotZ, u.slotHeading, 0);
  }
  G.heli.forced = true;
  G.heli.state = 'active';
  G.heli.active = true;
  G.heli.x = -52; G.heli.y = 24; G.heli.z = -9.5;
  G.heli.heading = -1.11;
  G.heli.rotorVel = 30; G.heli.rotor = 2.2;
  G.heli.spotX = -40; G.heli.spotZ = -3.6;
  G.wanted = 5; G.stage = STAGE.DELIVER; G.carrying = true; G.money = 260;
  G.player.mode = 'car';
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“ÁGUIA-1 tem o Vela no holofote. Fecha a avenida junto ao Farol.”', until: 1e9 };
  G.seen = true;
  setCameraLook(G, -19, 5.5, 4.5, -55, 9.5, -13);
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
  // P1-C recomposition (measured): the old camera stood 19–24 m from every
  // subject, all clustered at the centre at postcard size. Five metres closer
  // and a step lower, Rui sits right of centre (NDC x 0.16), the Vela left
  // (-0.23) and the garage door between them — same story, larger in frame.
  setCameraLook(G, 42, 4.2, -0.5, 56, 1.1, 12);
}
