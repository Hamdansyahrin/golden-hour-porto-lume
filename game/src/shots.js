// Staged scenes for Golden Hour's screenshots. Every scene below is placed by
// hand — exact coordinates, exact headings, exact wanted level — on top of the
// same seeded Porto Lume the game always builds, and then the real simulation
// runs a fixed number of steps to settle it. Nothing here reads the clock or
// rolls dice, so a given ?shot= name frames the identical scene on every run.
//
//   ?shot=boxin     SHOT 1, the cover: the PMPL box-in on Avenida do Farol.
//   ?shot=foot      on foot at the festival stalls, moments before the lift.
//   ?shot=deliver   the drop at Dona Pilar's garage, job complete.
//   ?shot=roadblock P1-B: the 4-star blockade across the boulevard.
//   ?shot=heli      P1-B cover candidate: 5 stars, ÁGUIA-1's spotlight, the
//                   roadblock ahead and the Farol closing the frame.
//   ?shot=festival  P1-D: the crowded festival frame — Rui in front of the
//                   stall row on Rua das Flores at golden hour, the crowd
//                   around the bancas, bunting overhead, the M1 objective live.

import { WORLD, headingTo } from './city.js';
import { STAGE } from './missions.js';
import { setCameraLook } from './player.js';
import { placeRoadblock } from './actors.js';

function placeCar(car, x, z, heading, speed = 0) {
  car.x = x; car.z = z; car.heading = heading; car.speed = speed;
}

/**
 * Park the P1-A traffic cars (indices 5 and up) on distant waypoints of their
 * own routes. The wider fleet must never drift into a staged frame while the
 * settle steps run, so each car is dropped exactly onto its route with its
 * target set to the following waypoint: the settle then drives it along its
 * own street, deterministically, well away from the camera.
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

/** Put G into the named scene and run the fixed settle steps through `step`. */
export function stageShot(G, name, step) {
  G.screen = 'play';
  if (name === 'foot') return stageFoot(G, step);
  if (name === 'deliver') return stageDeliver(G, step);
  if (name === 'roadblock') return stageRoadblock(G, step);
  if (name === 'heli') return stageHeli(G, step);
  if (name === 'festival') return stageFestival(G, step);
  return stageBoxin(G, step);
}

function settle(G, step, seconds) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) step(1 / 60);
}

// SHOT 1 — the box-in. Rui's Vela sits on the boulevard with the PMPL car cut
// across its nose, traffic queued behind, pedestrians watching from both
// sidewalks, CALOR at 3 stars, the delivery objective up on the mission card
// and every blip live on the minimap.
function stageBoxin(G, step) {
  G.stage = STAGE.DELIVER;
  G.carrying = true;
  G.wanted = 3;
  G.money = 120;
  G.player.mode = 'car';
  placeCar(G.playerCar, 6, 3.6, -Math.PI / 2, 6);
  G.player.x = 6; G.player.z = 3.6; G.player.heading = -Math.PI / 2;
  // The patrol car, angled in across the Vela's nose, lights on.
  placeCar(G.police, 13.5, 1.2, -Math.PI / 2 - 0.62, 0);
  // Traffic: one car held up behind Rui, one approaching in the other lane,
  // one up the side street. (P1-C recomposition, measured with the engine's
  // own projection: the held car used to sit at x=-8, BEHIND the old camera
  // at x=-4.6 — claimed in this comment, invisible in the frame. It now waits
  // at x=-2.5 and the camera pulls back to x=-7.5, so it reads as a
  // foreground layer lower-left while the Vela/LUME-1 pair keeps its centred
  // confrontation.)
  placeCar(G.traffic[0], -2.5, 3.6, -Math.PI / 2, 0);
  placeCar(G.traffic[1], 30, -3.6, Math.PI / 2, 5);
  placeCar(G.traffic[2], 17.6, -14, Math.PI, 4);
  placeCar(G.traffic[3], -20, -3.6, Math.PI / 2, 6);
  placeCar(G.traffic[4], 22.4, 20, 0, 4);
  parkExtraTraffic(G);
  // Pedestrians along both sidewalks, two of them already fleeing the brakes.
  placePed(G.peds[0], -2, 8.8, Math.PI / 2);
  placePed(G.peds[1], 16, 8.8, -Math.PI / 2, 'flee');
  placePed(G.peds[2], 24, -8.8, Math.PI / 2);
  placePed(G.peds[3], -12, -8.8, -Math.PI / 2);
  placePed(G.peds[4], 34, 8.8, Math.PI / 2);
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“Fecha a avenida. O Vela é nosso — LUME-1 a bloquear.”', until: 1e9 };
  G.seen = true;
  settle(G, step, 0.35);
  // Re-pin the principals once the settle has run, so the frame stays exact.
  placeCar(G.playerCar, 6, 3.6, -Math.PI / 2, 6);
  placeCar(G.police, 13.5, 1.2, -Math.PI / 2 - 0.62, 0);
  G.wanted = 3; G.stage = STAGE.DELIVER; G.carrying = true; G.money = 120;
  G.player.mode = 'car'; G.player.x = 6; G.player.z = 3.6;
  G.dialogue = { who: 'Inspetora Quintela (rádio PMPL)', text: '“Fecha a avenida. O Vela é nosso — LUME-1 a bloquear.”', until: 1e9 };
  G.seen = true;
  setCameraLook(G, -7.5, 3.4, 6.2, 11.5, 0.9, 1.8);
}

// SHOT 4 — the roadblock. Rui's Vela heads east on the boulevard at 4 stars;
// LUME-2 and LUME-4 are already formed nose-to-tail across both lanes ahead
// (placed by the real placeRoadblock logic, then pinned onto their slots),
// LUME-1 and LUME-3 are closing in from behind, and the wider gap on the far
// side reads as the way through.
function stageRoadblock(G, step) {
  G.stage = STAGE.DELIVER;
  G.carrying = true;
  G.wanted = 4;
  G.money = 120;
  G.player.mode = 'car';
  placeCar(G.playerCar, 0, 3.6, -Math.PI / 2, 6);
  G.player.x = 0; G.player.z = 3.6; G.player.heading = -Math.PI / 2;
  // P1-C recomposition (measured, engine projection): both chasers used to
  // sit at x=-13/-19, behind or beside the old camera at x=-9 — the "closing
  // in behind" this shot promises was never in the frame. LUME-1 now runs
  // 8 m behind Rui in his lane and LUME-3 cuts across the oncoming lane 4 m
  // back, and the camera pulls to (-14, 4.2, 7): NDC puts LUME-1 lower-left
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
  // Re-pin the principals once the settle has run, so the frame stays exact.
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

// SHOT 5 — the P1-B cover candidate, Porto Lume's own composition: Rui
// westbound toward the Farol at 5 stars in the last of the light, two PMPL
// cars on his tail, ÁGUIA-1 up ahead with its spotlight cone raking down onto
// the Vela, the roadblock waiting at the far end of the boulevard, and the
// 21 m Farol closing the frame over the rooftops. The HUD shows 5 stars plus
// ÁGUIA-1 NO AR, and the minimap is live.
//
// Recomposed after the first P1-B capture failed on pixels, not state: that
// camera sat on the south sidewalk at (-2, 3.5, 12), half a metre off the
// south row's building faces, so a brown wall filled the left 40% of the
// frame and ÁGUIA-1 — staged at 27 m, far up the sight line — clipped off
// the top edge, leaving only its cone, which read as a solid white sail. The
// camera now stands ON the boulevard itself, in the south lane east of the
// chase, with both building rows set well back at the frame edges; Rui runs
// at (-40, -3.6) and ÁGUIA-1 holds the same station live play uses — ahead
// of him and off his left shoulder, (-52, 24, -9.5), nose turned back toward
// him the way the live follow holds it — body and rotor fully inside the
// upper frame, cone slanting down to the Vela, the blockade at (-70, 0) and
// the Farol beyond it closing the right of the frame.
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
  // The blockade ahead, at the Farol end of the boulevard (real placement).
  placeRoadblock(G, G.playerCar);
  for (const id of [1, 3]) {
    const u = G.policeUnits[id];
    placeCar(u, u.slotX, u.slotZ, u.slotHeading, 0);
  }
  // ÁGUIA-1 on station ahead and above, its spotlight pinned to the Vela.
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

// SHOT 2 — on foot in Rua das Flores: Rui at the festival stalls, the gold
// package waiting on the middle banca, the keeper watching, pedestrians
// strolling past, CALOR still calm.
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

// SHOT 3 — the delivery: the Vela nosed onto the garage apron at golden hour,
// Rui at the door with the job-done card up, the patrol standing down further
// down the avenue.
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
  // subject, all of them clustered at the centre at postcard size. Five
  // metres closer and a step lower, Rui sits right of centre (NDC x 0.16),
  // the Vela to the left (-0.23) and the garage door between them — the same
  // story, larger in frame.
  setCameraLook(G, 42, 4.2, -0.5, 56, 1.1, 12);
}

// SHOT 6 — the festival (P1-D): the crowded golden-hour frame on Rua das
// Flores. Rui stands before the stall row with the M1 objective live (stage
// GO, the gold marker on the middle banca) and the street is FULL: the keeper
// at his banca, browsers at the stall fronts, a chat pair, strollers on the
// east sidewalk — eleven placed peds in and around the row. Traffic is pinned
// to the boulevard only (two cars); the rest of the fleet is parked far away
// on its own routes, and the PMPL waits far off at its depot with CALOR calm.
// The camera stands west of Rui looking east-north-east up the row, layering
// Rui in the foreground, the crowd mid-frame and at least three stall
// canopies under the Rua das Flores bunting strings. The composition was
// verified by projecting the subjects with the engine's own matrices (see
// the P1-D sim).
function stageFestival(G, step) {
  G.stage = STAGE.GO;
  G.missionIdx = 0;
  G.wanted = 0;
  G.money = 35;
  G.player.mode = 'foot';
  G.player.x = 23.2; G.player.z = 10; G.player.heading = -Math.PI / 2; // facing the stalls
  placeCar(G.playerCar, WORLD.playerCar.x, WORLD.playerCar.z, WORLD.playerCar.heading, 0);
  // Police far away: LUME-1 parked at its depot, the rest on standby there.
  placeCar(G.police, WORLD.policePark.x, WORLD.policePark.z, WORLD.policePark.heading, 0);
  // Traffic: two cars on the boulevard only; the other P0 cars pinned far
  // away on their own routes, the P1-A fleet parked by parkExtraTraffic.
  placeCar(G.traffic[0], -14, 3.6, -Math.PI / 2, 6);
  placeCar(G.traffic[1], 44, -3.6, Math.PI / 2, 6);
  placeCar(G.traffic[2], 17.6, -52, headingTo(2.4, -4), 0);
  G.traffic[2].wp = 2;
  placeCar(G.traffic[3], -86, 3.6, -Math.PI / 2, 0);
  G.traffic[3].wp = 1;
  placeCar(G.traffic[4], 22.4, -52, headingTo(0, 86), 0);
  G.traffic[4].wp = 4;
  parkExtraTraffic(G);
  // One parkExtra car (traffic[7], SOUTH_LOOP) would otherwise settle at the
  // Rua das Docas junction inside the festival street's band; pin it far east
  // on its own route instead (festival only — the shared parkExtraTraffic
  // spots stay as every other staging knows them).
  placeCar(G.traffic[7], 65.4, 33, headingTo(0, -28), 0);
  G.traffic[7].wp = 10;
  // The crowd around the stall row (stalls at x 26.4, z 0 / 6.5 / 13 / 19.5 / 26).
  placePed(G.peds[8], 24.9, 14.6, Math.PI); // the keeper at his banca
  placePed(G.peds[13], 24.8, 0.8, -Math.PI / 2); // browsers at the stall fronts
  placePed(G.peds[14], 24.8, 7.2, -Math.PI / 2);
  placePed(G.peds[15], 24.8, 19.8, -Math.PI / 2);
  placePed(G.peds[16], 24.8, 25.6, -Math.PI / 2);
  placePed(G.peds[0], 24.8, 11.2, -Math.PI / 2);
  placePed(G.peds[9], 24.6, 5.2, -Math.PI / 2);
  placePed(G.peds[17], 23.9, 16.8, headingTo(0.8, 0.8)); // a chat pair, face to face
  placePed(G.peds[18], 24.7, 17.6, headingTo(-0.8, -0.8));
  placePed(G.peds[5], 24.7, 4, 0); // strollers on the east sidewalk
  placePed(G.peds[6], 24.7, 22.5, Math.PI);
  G.dialogue = { who: 'Sr. Baltazar', text: '“É a hora dourada, Rui. As bancas estão cheias — e o festival espera por esse pacote.”', until: 1e9 };
  settle(G, step, 0.3);
  // Re-pin Rui and the placed crowd once the settle has run, frame exact.
  G.player.x = 23.2; G.player.z = 10; G.player.heading = -Math.PI / 2;
  G.player.mode = 'foot';
  placePed(G.peds[8], 24.9, 14.6, Math.PI);
  placePed(G.peds[13], 24.8, 0.8, -Math.PI / 2);
  placePed(G.peds[14], 24.8, 7.2, -Math.PI / 2);
  placePed(G.peds[15], 24.8, 19.8, -Math.PI / 2);
  placePed(G.peds[16], 24.8, 25.6, -Math.PI / 2);
  placePed(G.peds[0], 24.8, 11.2, -Math.PI / 2);
  placePed(G.peds[9], 24.6, 5.2, -Math.PI / 2);
  placePed(G.peds[17], 23.9, 16.8, headingTo(0.8, 0.8));
  placePed(G.peds[18], 24.7, 17.6, headingTo(-0.8, -0.8));
  placePed(G.peds[5], 24.7, 4, 0);
  placePed(G.peds[6], 24.7, 22.5, Math.PI);
  G.wanted = 0; G.stage = STAGE.GO; G.money = 35;
  G.markerX = WORLD.stall.x; G.markerZ = WORLD.stall.z;
  G.prompt = '<b>E</b> — levantar o pacote da banca';
  G.dialogue = { who: 'Sr. Baltazar', text: '“É a hora dourada, Rui. As bancas estão cheias — e o festival espera por esse pacote.”', until: 1e9 };
  setCameraLook(G, 17.9, 2.7, 1.6, 25.9, 1.9, 11.8);
}
