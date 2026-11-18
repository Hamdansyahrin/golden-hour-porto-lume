// Golden Hour's game state, its story chain and the CALOR wanted system. P1-D
// generalises the one P0 job into a chain of four missions (the MISSIONS table
// below), accepted one at a time from their givers: M1 "O Pacote do Festival"
// (Rui lifts a package from a festival stall on Rua das Flores — a crime, if
// anyone sees it — and delivers it to Dona Pilar's garage), M2 "A Encomenda das
// Docas" (a timed, perfectly legal lantern-oil pickup), M3 "A Escolta de Dona
// Amélia" (walk the committee chair up Avenida Leste, staying close) and M4 "As
// Luzes do Festival" (collect three light crates and return them to the stall).
// Between missions Porto Lume is free: repeatable supply runs leave from the
// stall and Dona Pilar's garage tunes the Vela (see the shop section below).
// The PMPL's CALOR meter (1–5 stars) rises on witnessed crime and on ramming under
// pursuit, and falls only while nobody can see Rui. If a patrol car holds contact
// with a slow Rui for three seconds, he is detained and the current job resets.
//
// ============================================================================
// CALOR — the 5-star ladder (P1-B). The level is a response doctrine, not just
// a number; actors.js drives each unit's behaviour from it:
//   1★ RESPOSTA INICIAL   — the nearest unit alone responds (pursuit).
//   2★ PERSEGUIÇÃO ATIVA  — that unit pursues at full pressure.
//   3★ RESPOSTA MÚLTIPLA  — two more units (LUME-2, LUME-3) join the pursuit.
//   4★ INTERCEÇÃO         — LUME-3 cuts off a point ahead of Rui's route and
//                           LUME-4 + one other form a roadblock (BLOQUEIO).
//   5★ RESPOSTA MÁXIMA    — every unit plus the ÁGUIA-1 helicopter overhead.
//
// Exact event rules — CALOR changes ONLY on these real gameplay events, never
// on a timer alone and never scripted in live play:
//   RAISE
//   R1 Package lift witnessed (keeper/pedestrian within 15 m of the stall, or
//      any police unit within 34 m): wanted := max(wanted, 2).
//   R2 Hard ram (car-to-car impact > 7 with Rui himself moving faster than
//      3 m/s — being rammed while parked flags nothing — flagged by
//      collideCars) against a POLICE unit while wanted >= 1:
//      wanted := min(5, max(wanted + 1, 3)) — the first police ram therefore
//      always lands on at least 3★. Guarded by a 5 s ram cooldown, so one
//      crash cannot multi-trigger while the cars separate.
//   R3 Hard ram against a TRAFFIC car while wanted >= 2 and any unit has
//      line-of-sight on Rui (a witnessed second crime): wanted += 1 (max 5),
//      same 5 s cooldown as R2.
//   R4 Sustained flight in sight: while any unit has LOS and Rui's speed is
//      above 7 m/s, calorFlightT accumulates; at 12 s (3★ or below) or 16 s
//      (4★) of accumulated seen flight with wanted >= 2, wanted += 1 and the
//      accumulator resets. Out of sight or slow, it bleeds off at half rate.
//   DECAY
//   D1 Stars fall one at a time, only while Rui is UNSEEN (no police LOS and
//      no pedestrian within 10 m). The unseen time needed per star grows with
//      the level — 1★: 8 s, 2★: 9 s, 3★: 11 s, 4★: 13 s, 5★: 15 s
//      (DECAY_SECONDS below). Regaining sight resets the unseen clock to 0.
//   D2 Delivery stand-down (cooldownT) clears CALOR to 0 when it expires, as
//      in P0 — the one non-decay clear, and it belongs to the mission.
// ============================================================================

import { WORLD, headingTo } from './city.js';
import { createRng } from './random.js';
import { storeSave } from './save.js';
import { BOULEVARD_LOOP, SIDE_LOOP, NORTH_LOOP, SOUTH_LOOP, WEST_LOOP, OUTER_LOOP, DOCAS_LOOP } from './actors.js';

export const STAGE = { GO: 1, DELIVER: 2, FREE: 4, ESCORT: 5, COLLECT: 6 };
export const PAYMENT = 450;

/**
 * The story chain (P1-D). G.missionIdx is the NEXT mission to run (0-based);
 * G.completed counts the finished ones; when missionIdx reaches
 * MISSIONS.length the chain is complete and Porto Lume stays FREE. M1 is the
 * opening job: it starts active at GO with no giver to accept from (as in P0).
 * Every later mission is accepted at its giver (stage FREE, E at the marker),
 * opens its intro card, and only starts — timers included — when the card is
 * dismissed. `timer` is the accept-to-deliver budget in seconds for the timed
 * missions (null for the others); `doneSay` is the giver's line on delivery,
 * `doneStory` the completion card's story text and `donePay` its payout suffix.
 */
export const MISSIONS = [
  {
    id: 'pacote', title: 'O Pacote do Festival', giver: 'Dona Pilar Andrade', payout: 450, timer: null,
    intro: '',
    doneWho: 'Dona Pilar',
    doneSay: '“Boa, Rui. Quatrocentos e cinquenta lumes. A dívida encolhe — e a luz ainda dura.”',
    doneStory: 'O pacote chegou à garagem de Dona Pilar.',
    donePay: 'A dívida do teu pai encolhe. Porto Lume respira — por agora.',
    job: '<b>Trabalho 1 — O Pacote do Festival:</b> levanta o pacote da banca do festival na Rua das Flores e entrega-o na garagem de Dona Pilar, na avenida. A Polícia Municipal de Porto Lume (PMPL) está a ver — o CALOR sobe quando te veem cometer o crime.',
  },
  {
    id: 'docas', title: 'A Encomenda das Docas', giver: 'Dona Pilar Andrade', payout: 600, timer: 300,
    intro: 'O azeite das lanternas do festival nunca chegou ao porto. Há uma caixa à espera no cais das Docas, junto aos contentores — vai buscá-la a pé e traz-ma para a garagem antes que o prazo passe. E ouve, Rui: é carga legal. Ninguém te pode acusar de transportar azeite.',
    doneWho: 'Dona Pilar',
    doneSay: '“Seiscentos lumes, Rui. As lanternas têm azeite — e desta vez ninguém te pode apontar o dedo.”',
    doneStory: 'A caixa de azeite das lanternas chegou à garagem, dentro do prazo.',
    donePay: 'As lanternas do festival já têm azeite. A dívida encolhe mais um pouco.',
    job: '<b>Trabalho 2 — A Encomenda das Docas:</b> a caixa de azeite das lanternas espera nas Docas. Levanta-a e entrega-a na garagem de Dona Pilar antes que o prazo passe — carga legal, sem CALOR pelo levantamento.',
  },
  {
    id: 'escolta', title: 'A Escolta de Dona Amélia', giver: 'Dona Amélia Furtado', payout: 550, timer: null,
    intro: 'Dona Amélia Furtado, presidente da comissão do festival, espera no topo norte da Avenida Leste. Quer chegar às bancas da Rua das Flores a pé, como manda a tradição — mas não sozinha. Acompanha-a de perto: se te afastares mais de uns passos largos, ela pára e espera por ti.',
    doneWho: 'Dona Amélia',
    doneSay: '“Quinhentos e cinquenta lumes, Rui. Um cavalheiro — a comissão agradece.”',
    doneStory: 'Dona Amélia chegou às bancas do festival pelo braço de Rui.',
    donePay: 'A presidente da comissão chegou inteira. A dívida encolhe mais um pouco.',
    job: '<b>Trabalho 3 — A Escolta de Dona Amélia:</b> Dona Amélia espera no topo da Avenida Leste. Acompanha-a a pé até às bancas do festival, sem te afastares dela.',
  },
  {
    id: 'luzes', title: 'As Luzes do Festival', giver: 'Sr. Baltazar', payout: 800, timer: 420,
    intro: 'O Sr. Baltazar, o homem da banca, perdeu três caixas de luzes do festival pela cidade: uma no cais do Farol, uma na Praça do Relógio e uma nas Docas. Recolhe as três — a pé ou de carro, basta passar perto — e devolve-as à banca antes que o prazo passe. Sem luzes, não há festival.',
    doneWho: 'Sr. Baltazar',
    doneSay: '“Oitocentos lumes! As luzes voltaram, Rui — o festival está salvo!”',
    doneStory: 'As três caixas de luzes voltaram à banca e o festival acende-se ao pôr-do-sol.',
    donePay: 'O festival está salvo — e a dívida do teu pai, finalmente, está paga.',
    job: '<b>Trabalho 4 — As Luzes do Festival:</b> três caixas de luzes perderam-se pela cidade — Farol, Praça do Relógio e Docas. Recolhe-as e devolve-as à banca do Sr. Baltazar antes que o prazo passe.',
  },
];

/** Where each mission is accepted from: M2 at the garage door, M3 at Dona Amélia's corner, M4 (and M1's stall) at the banca. */
export function giverPoint(idx) {
  if (idx === 1) return { x: WORLD.garage.x, z: WORLD.garage.z };
  if (idx === 2) return { x: 24.7, z: -48 };
  return { x: WORLD.stall.x, z: WORLD.stall.z };
}

/** The mission G is currently on (or null once the chain is complete). */
export function currentMission(G) {
  return MISSIONS[G.missionIdx] ?? null;
}

/** M4's three light crates: Farol apron, Praça do Relógio, Docas apron. */
export const LIGHT_CRATES = [
  { x: -66, z: -20 },
  { x: 35, z: -50 },
  { x: -38, z: 45 },
];

/** M3's walk: Dona Amélia strolls the east sidewalk from the north end to the stalls. */
export const ESCORT_FROM = { x: 24.7, z: -48 };
export const ESCORT_TO = { x: 24.7, z: 20 };
export const ESCORT_SPEED = 1.35;
export const ESCORT_RANGE = 14;

/**
 * The garage shop's paint shelf: index 0 is the Vela's factory teal (its
 * P0 colour); each purchase advances G.upgrades.paint by one (mod 5) and
 * recolours the car at once — paintCar reads car.body every frame.
 */
export const PAINTS = [
  { name: 'Fábrica Teal', body: [0.12, 0.55, 0.6] },
  { name: 'Coral do Farol', body: [0.85, 0.32, 0.22] },
  { name: 'Azul das Docas', body: [0.2, 0.4, 0.75] },
  { name: 'Ouro do Festival', body: [0.9, 0.7, 0.2] },
  { name: 'Verde da Maré', body: [0.15, 0.5, 0.4] },
];
export const SHOP_PRICES = { paint: 150, tune: 500, bumper: 350 };

/** The shop menu model hud.js renders while G.shopOpen: balance + the four rows (3 items + Sair). */
export function shopMenu(G) {
  const next = PAINTS[(G.upgrades.paint + 1) % PAINTS.length];
  const entries = [
    { label: `Pintura nova do Vela — ${next.name}`, price: SHOP_PRICES.paint, note: '' },
    { label: 'Motor afinado', price: SHOP_PRICES.tune, note: G.upgrades.tune ? 'já instalado' : '' },
    { label: 'Pára-choques reforçado', price: SHOP_PRICES.bumper, note: G.upgrades.bumper ? 'já instalado' : '' },
    { label: 'Sair', price: null, note: '' },
  ];
  const html = entries.map((e, i) => {
    const sel = i === G.shopSel;
    const price = e.price != null ? ` — ${e.price} lumes` : '';
    const note = e.note ? ` (${e.note})` : '';
    return `<div class="shopItem${sel ? ' sel' : ''}">${sel ? '› ' : ''}${e.label}${price}${note}</div>`;
  }).join('');
  return { balance: `Saldo: ${G.money} lumes`, html };
}

/**
 * Activate the selected shop row (ENTER while the shop is open). Buying
 * rules: an owned one-time item and a too-thin purse both refuse WITHOUT
 * charging; a sale deducts once, applies at once and confirms with the new
 * balance in dialogue. Row 3 (Sair) just closes the menu.
 */
function shopActivate(G) {
  const sel = G.shopSel;
  if (sel === 3) { G.shopOpen = false; return; }
  if (sel === 0) {
    const price = SHOP_PRICES.paint;
    if (G.money < price) { say(G, 'Dona Pilar', `Lumes insuficientes — faltam ${price - G.money}.`); return; }
    G.money -= price;
    G.upgrades.paint = (G.upgrades.paint + 1) % PAINTS.length;
    G.playerCar.body = [...PAINTS[G.upgrades.paint].body];
    say(G, 'Dona Pilar', `“${PAINTS[G.upgrades.paint].name} — fica-lhe bem, ao Vela. Saldo: ${G.money} lumes.”`);
    storeSave(G);
    return;
  }
  if (sel === 1) {
    if (G.upgrades.tune) { say(G, 'Dona Pilar', 'Já está instalado no Vela.'); return; }
    const price = SHOP_PRICES.tune;
    if (G.money < price) { say(G, 'Dona Pilar', `Lumes insuficientes — faltam ${price - G.money}.`); return; }
    G.money -= price;
    G.upgrades.tune = true;
    say(G, 'Dona Pilar', `“Motor afinado — o Vela respira melhor. Saldo: ${G.money} lumes.”`);
    storeSave(G);
    return;
  }
  if (G.upgrades.bumper) { say(G, 'Dona Pilar', 'Já está instalado no Vela.'); return; }
  const price = SHOP_PRICES.bumper;
  if (G.money < price) { say(G, 'Dona Pilar', `Lumes insuficientes — faltam ${price - G.money}.`); return; }
  G.money -= price;
  G.upgrades.bumper = true;
  say(G, 'Dona Pilar', `“Pára-choques reforçado — aguenta o que a avenida der. Saldo: ${G.money} lumes.”`);
  storeSave(G);
}

/** Side-run destinations (item 2b), rotated by the completed-run counter. */
export const SIDE_DESTS = [
  { x: -38, z: 45, name: 'Docas' },
  { x: 35, z: -50, name: 'Praça do Relógio' },
  { x: 55, z: 13.5, name: 'Garagem de Dona Pilar' },
];
export const SIDE_PAY = 120;
export const SIDE_COOLDOWN = 90;

/** Unseen seconds needed to shed one star, indexed by current CALOR level. */
export const DECAY_SECONDS = { 1: 8, 2: 9, 3: 11, 4: 13, 5: 15 };
/** HUD/response doctrine label per CALOR level (hud.js renders it under the stars). */
export const CALOR_LABEL = {
  0: '', 1: 'RESPOSTA INICIAL', 2: 'PERSEGUIÇÃO ATIVA', 3: 'RESPOSTA MÚLTIPLA',
  4: 'INTERCEÇÃO + BLOQUEIO', 5: 'ÁGUIA-1 NO AR · RESPOSTA MÁXIMA',
};
/** Wanted level at which each police unit (by index) joins the response. */
export const UNIT_JOIN_LEVEL = [0, 3, 3, 4];

// Pedestrian clothing palettes (P1-C widened: rose, deep green, white linen
// and burgundy tops; linen and denim bottoms; a grey hair tone — the crowd
// stops reading as six shirts on rotation). Seeded picks, as always.
const PED_TOPS = [[0.8, 0.35, 0.25], [0.3, 0.55, 0.6], [0.9, 0.7, 0.3], [0.45, 0.4, 0.7], [0.85, 0.85, 0.8], [0.6, 0.3, 0.45], [0.92, 0.45, 0.55], [0.25, 0.45, 0.35], [0.95, 0.92, 0.88], [0.55, 0.25, 0.2]];
const PED_BOTTOMS = [[0.25, 0.25, 0.35], [0.4, 0.3, 0.2], [0.3, 0.35, 0.3], [0.55, 0.45, 0.35], [0.85, 0.8, 0.7], [0.2, 0.3, 0.45]];
const SKIN = [[0.85, 0.62, 0.45], [0.62, 0.42, 0.3], [0.95, 0.75, 0.55], [0.5, 0.34, 0.24]];
const HAIR = [[0.15, 0.1, 0.08], [0.35, 0.22, 0.12], [0.6, 0.5, 0.4], [0.1, 0.1, 0.12], [0.75, 0.72, 0.68]];
// Traffic paint (P1-C widened within the same slots: models, taxi/van flags
// and routes are unchanged — only the hues spread wider across the harbour
// palette, so a held-up queue reads as seven different cars, not three).
const TRAFFIC_PAINT = [
  { body: [0.84, 0.34, 0.22], name: 'Ondina' },
  { body: [0.27, 0.47, 0.78], name: 'Ondina' },
  { body: [0.92, 0.75, 0.25], name: 'Táxi Lume', taxi: true },
  { body: [0.85, 0.85, 0.82], name: 'Furgão Brisa', van: true },
  { body: [0.32, 0.66, 0.52], name: 'Ondina' },
  { body: [0.92, 0.75, 0.25], name: 'Táxi Lume', taxi: true },
  { body: [0.9, 0.76, 0.5], name: 'Ondina' },
  { body: [0.55, 0.62, 0.72], name: 'Furgão Brisa', van: true },
  { body: [0.16, 0.5, 0.58], name: 'Ondina' },
  { body: [0.92, 0.75, 0.25], name: 'Táxi Lume', taxi: true },
  { body: [0.63, 0.35, 0.55], name: 'Ondina' },
  { body: [0.8, 0.8, 0.78], name: 'Furgão Brisa', van: true },
  { body: [0.9, 0.56, 0.18], name: 'Ondina' },
];
// One route per car, in paint order: the P0 five keep their P0 routes, the P1-A cars
// take the new loops so every street in the grid carries traffic.
const TRAFFIC_ROUTES = [
  BOULEVARD_LOOP, BOULEVARD_LOOP, SIDE_LOOP, BOULEVARD_LOOP, SIDE_LOOP,
  NORTH_LOOP, NORTH_LOOP, SOUTH_LOOP, SOUTH_LOOP, WEST_LOOP,
  OUTER_LOOP, OUTER_LOOP, DOCAS_LOOP,
];

function makePed(rng, path, wp, opts = {}) {
  return {
    x: path[wp][0], z: path[wp][1], heading: 0, speed: rng.range(1.1, 1.6),
    path, wp, dir: 1, state: 'walk', fleeT: 0, threatX: 0, threatZ: 0,
    walkPhase: rng.range(0, 6), stationary: !!opts.stationary,
    // P1-A behaviours: 'walk' patrols its path, 'browse' pauses at each path end
    // (a shopper at a stall), stationary peds with a partner to face are chat pairs.
    behavior: opts.behavior ?? 'walk', pauseT: 0, pauseDur: opts.pauseDur ?? 0,
    top: opts.top ?? rng.pick(PED_TOPS), trousers: rng.pick(PED_BOTTOMS),
    skin: rng.pick(SKIN), hair: rng.pick(HAIR),
  };
}

/** Build the whole mutable game state. The layout seed is fixed: Porto Lume is one city. */
export function createGameState(colliders) {
  const rng = createRng(99173);
  const playerCar = {
    x: WORLD.playerCar.x, z: WORLD.playerCar.z, heading: WORLD.playerCar.heading, speed: 0,
    kind: 'player', name: 'Vela Sprint', body: [0.12, 0.55, 0.6], cabin: [0.1, 0.16, 0.22],
    route: BOULEVARD_LOOP, wp: 0, cruise: 0, neighbours: [],
  };
  // Hand-staggered start waypoints (index into each car's route): no two cars share a
  // start point, and cars sharing a route start far apart on it.
  const TRAFFIC_START_WP = [0, 3, 1, 4, 4, 1, 6, 2, 7, 1, 8, 3, 5];
  const traffic = [];
  for (let i = 0; i < TRAFFIC_ROUTES.length; i++) {
    const route = TRAFFIC_ROUTES[i];
    const wp = TRAFFIC_START_WP[i] % route.length;
    const paint = TRAFFIC_PAINT[i];
    const cruise = paint.van ? rng.range(6.5, 8.5) : paint.taxi ? rng.range(9, 11.5) : rng.range(7.5, 10.5);
    const next = route[(wp + 1) % route.length];
    traffic.push({
      x: route[wp][0], z: route[wp][1], heading: headingTo(next[0] - route[wp][0], next[1] - route[wp][1]), speed: 0, kind: 'traffic',
      name: paint.name, body: paint.body, taxi: !!paint.taxi, van: !!paint.van,
      route, wp: (wp + 1) % route.length, cruise, neighbours: [],
    });
  }
  // The PMPL response fleet (P1-B): four named cars, each with a depot it waits at
  // while its CALOR join level is not reached. LUME-1 keeps the P0 park spot and the
  // P0 boulevard patrol; the others wait on the south road, the north road and the
  // west street, so a join never pops in next to Rui — it drives in from its depot.
  const UNIT_NAMES = ['LUME-1', 'LUME-2', 'LUME-3', 'LUME-4'];
  const UNIT_DEPOTS = [
    { x: WORLD.policePark.x, z: WORLD.policePark.z, heading: WORLD.policePark.heading },
    { x: -58, z: 41, heading: -Math.PI / 2 },
    { x: 64, z: -51, heading: Math.PI / 2 },
    { x: -59.4, z: 33, heading: Math.PI },
  ];
  const policeUnits = UNIT_DEPOTS.map((d, i) => ({
    x: d.x, z: d.z, heading: d.heading, speed: 0,
    kind: 'police', name: UNIT_NAMES[i], body: [0.92, 0.93, 0.95], cabin: [0.12, 0.2, 0.34],
    route: BOULEVARD_LOOP, wp: 1, cruise: 6.5, neighbours: [], pursuing: false,
    // P1-B per-unit AI state (actors.js owns the behaviour; fields live here so the
    // whole fleet is created in one place). mode is one of standby / patrol /
    // pursuit / intercept / search / roadblock / return.
    id: i, depot: d, mode: i === 0 ? 'patrol' : 'standby', active: i === 0,
    hasLOS: false, losT: i * 0.06, unseenSec: 0,
    lastKnownX: d.x, lastKnownZ: d.z, lastKnownAge: 999,
    searchIdx: i, searchT: 0, holdT: 0, slotX: 0, slotZ: 0, slotHeading: 0,
    detourT: 0, pinT: 0, pinX: d.x, pinZ: d.z,
  }));
  const police = policeUnits[0]; // legacy alias: LUME-1 is "the" patrol of P0/P1-A code
  const all = [playerCar, ...traffic, ...policeUnits];
  for (const c of all) c.neighbours = all;

  const southWalk = [[-86, 8.8], [86, 8.8]];
  const northWalk = [[86, -8.8], [-86, -8.8]];
  const eastWalk = [[24.7, 34], [24.7, -48]];
  const westWalk = [[13.9, -48], [13.9, 34]];
  const peds = [
    makePed(rng, southWalk, 0), makePed(rng, southWalk, 1), makePed(rng, southWalk, 0),
    makePed(rng, northWalk, 0), makePed(rng, northWalk, 1),
    makePed(rng, eastWalk, 0), makePed(rng, eastWalk, 1),
    makePed(rng, westWalk, 0),
  ];
  peds[2].x = 40; peds[5].z = -20; peds[6].z = 22;
  // The stall keeper never leaves his banca — and he always sees the lift.
  const keeper = makePed(rng, [[24.9, 14.6]], 0, { stationary: true, top: [0.85, 0.3, 0.24] });
  keeper.heading = Math.PI; // face the stall
  peds.push(keeper);

  // ---- P1-A crowd: 25 more Porto Lume residents (34 peds in total). The boulevard
  // and the festival street stay the densest, as they should at golden hour; the new
  // roads get lighter foot traffic. All seeded, all on sidewalk paths.
  // More boulevard strollers.
  const blvdExtra = [
    makePed(rng, southWalk, 0), makePed(rng, southWalk, 1),
    makePed(rng, northWalk, 0), makePed(rng, northWalk, 1),
  ];
  blvdExtra[0].x = -58; blvdExtra[1].x = 62; blvdExtra[2].x = -20; blvdExtra[3].x = 48;
  peds.push(...blvdExtra);
  // Festival browsers: short strolls along the stall sidewalk, pausing at each end
  // to look at the bancas.
  for (const [z0, z1] of [[1, 5.5], [8, 12], [14.5, 18.5], [20.5, 25]]) {
    peds.push(makePed(rng, [[24.7, z0], [24.7, z1]], 0, { behavior: 'browse', pauseDur: rng.range(2.5, 5) }));
  }
  // Two idle chat pairs, standing face to face: one on the boulevard's south
  // sidewalk, one on Praça do Relógio.
  function chatPair(x0, z0, x1, z1) {
    const a = makePed(rng, [[x0, z0]], 0, { stationary: true });
    const b = makePed(rng, [[x1, z1]], 0, { stationary: true });
    a.heading = headingTo(x1 - x0, z1 - z0);
    b.heading = headingTo(x0 - x1, z0 - z1);
    peds.push(a, b);
  }
  chatPair(-12, 9.3, -10.9, 8.5);
  chatPair(35, -54.2, 36.3, -55);
  // Walkers on the new roads' sidewalks.
  const northWalkS = [[-86, -41.8], [86, -41.8]];
  const northWalkN = [[86, -54.2], [-86, -54.2]];
  const southWalkN = [[-86, 31.8], [86, 31.8]];
  const southWalkS = [[86, 44.2], [-86, 44.2]];
  const westWalkE = [[-55.8, 44], [-55.8, -42]];
  const eastWalkW = [[61.8, -42], [61.8, 44]];
  const docasWalk = [[-50, 46.6], [8, 46.6]];
  const plazaWalk = [[28, -53.8], [46, -53.8]];
  const nw1 = makePed(rng, northWalkS, 0); nw1.x = -40;
  const nw2 = makePed(rng, northWalkS, 1); nw2.x = 55;
  const nw3 = makePed(rng, northWalkN, 0); nw3.x = 5;
  const nw4 = makePed(rng, northWalkN, 1); nw4.x = -70;
  const sw1 = makePed(rng, southWalkN, 0); sw1.x = -15;
  const sw2 = makePed(rng, southWalkN, 1); sw2.x = 75;
  const sw3 = makePed(rng, southWalkS, 0); sw3.x = 30;
  const ww1 = makePed(rng, westWalkE, 0); ww1.z = 10;
  const ww2 = makePed(rng, westWalkE, 1); ww2.z = -25;
  const ew1 = makePed(rng, eastWalkW, 0); ew1.z = -8;
  const ew2 = makePed(rng, eastWalkW, 1); ew2.z = 20;
  peds.push(nw1, nw2, nw3, nw4, sw1, sw2, sw3, ww1, ww2, ew1, ew2,
    makePed(rng, docasWalk, 0), makePed(rng, plazaWalk, 0));

  return {
    screen: 'title',
    time: 0,
    colliders,
    camera: { x: -52, y: 9, z: 30, yaw: 0.6, pitch: -0.12 },
    camYaw: Math.PI - WORLD.playerCar.heading,
    moveYaw: Math.PI - WORLD.playerCar.heading,
    interactPressed: false,
    player: {
      x: WORLD.spawn.x, z: WORLD.spawn.z, heading: -Math.PI / 2, speed: 0,
      mode: 'foot', walkPhase: 0, moveSig: 0, moving: false,
      top: [0.12, 0.5, 0.55], trousers: [0.2, 0.2, 0.26], skin: SKIN[0], hair: HAIR[0],
      state: 'walk',
    },
    playerCar, traffic, police, policeUnits, peds,
    // ÁGUIA-1, the PMPL helicopter (P1-B): parked by the Farol until 5★ (or a staged
    // shot) calls it up. state is parked / active / return; rotor is a sim-time phase.
    heli: {
      active: false, forced: false, state: 'parked',
      x: -72, y: 0.9, z: -26, heading: 0.6, rotor: 0, rotorVel: 0, bank: 0,
      pvx: 0, pvz: 0,
      spotX: -72, spotZ: -26, padX: -72, padZ: -26,
    },
    // The current roadblock engagement (actors.js places and releases it).
    roadblock: {
      active: false, cx: 0, cz: 0, horiz: true, gap: 0, age: 0,
      cooldownT: 0, minDist: 999, slots: null,
    },
    wanted: 0, seenTimer: 0, decayClock: 0, bustMeter: 0, bumpTimer: 0,
    // P1-B CALOR bookkeeping: unseenT is the live decay clock (seconds with no LOS
    // and no close pedestrian), calorFlightT the R4 sustained-flight accumulator,
    // ramCooldownT the R2/R3 guard, bumpKind remembers what the last hard bump hit.
    unseenT: 0, calorFlightT: 0, ramCooldownT: 0, bumpKind: null, seen: false,
    crimeTimer: 0, crimeX: 0, crimeZ: 0, cooldownT: 0,
    money: 0, stage: STAGE.GO, carrying: false,
    prompt: null, dialogue: null, nearCar: false,
    markerX: WORLD.stall.x, markerZ: WORLD.stall.z,
    // P1-D chain state: missionIdx is the next mission to run, completed the
    // finished count, timer the seconds left on a timed mission (null = no
    // clock). cargo names what Rui carries ('pacote' | 'azeite' |
    // 'mantimentos'); `carrying` stays as its boolean mirror for the staged
    // shots and older readers — setCargo keeps the two in step, and a bare
    // carrying=true with cargo null (how shots.js stages M1) reads as the
    // M1 package. crates/collected are M4's scratch, escort* M3's.
    missionIdx: 0, completed: 0, timer: null,
    cargo: null, crates: [], collected: 0,
    escort: null, escortWait: false, escortHint: false,
    // P1-D economy state: side-run cooldown/counter/destination, the garage
    // shop (open flag + selected menu row) and the one-shot confirm latch
    // main.js fills while the shop is open, plus the Vela's upgrades.
    sideCd: 0, sideRuns: 0, sideDest: null,
    shopOpen: false, shopSel: 0, confirmPressed: false,
    upgrades: { paint: 0, tune: false, bumper: false },
    // P1-D card/save state: card is the intro/fail card hud.js renders while
    // screen==='card'; lastDone feeds the completion card; saveLoaded marks
    // a restored browser save (item 3).
    card: null, lastDone: null, saveLoaded: false,
  };
}

function say(G, who, text, seconds = 6) {
  G.dialogue = { who, text, until: G.time + seconds };
}

/** Set what Rui carries, keeping the boolean `carrying` mirror in step. */
export function setCargo(G, kind) {
  G.cargo = kind;
  G.carrying = kind != null;
}

/** Is Rui carrying anything? (A staged carrying=true with cargo null counts: it is the M1 package.) */
export function hasCargo(G) {
  return G.carrying || G.cargo != null;
}

/** Open the current mission's intro card. The mission itself starts only when the card is dismissed. */
function openIntro(G) {
  const def = currentMission(G);
  if (!def) return;
  G.card = {
    kicker: `Trabalho ${G.missionIdx + 1} · ${def.giver}`,
    title: def.title,
    body: def.intro,
    go: 'COMEÇAR — prime ENTER',
    action: 'start',
  };
  G.screen = 'card';
}

/** Spawn Dona Amélia as an escort ped: updatePeds skips escort peds; updateMission walks her. */
function spawnEscort(G) {
  const ped = {
    x: ESCORT_FROM.x, z: ESCORT_FROM.z, heading: 0, speed: ESCORT_SPEED,
    path: [[ESCORT_FROM.x, ESCORT_FROM.z], [ESCORT_TO.x, ESCORT_TO.z]], wp: 1, dir: 1,
    state: 'walk', fleeT: 0, threatX: 0, threatZ: 0,
    walkPhase: 0, stationary: false,
    behavior: 'walk', pauseT: 0, pauseDur: 0,
    top: [0.45, 0.12, 0.2], trousers: [0.25, 0.25, 0.35],
    skin: SKIN[1], hair: HAIR[2],
    escort: true,
  };
  G.peds.push(ped);
  G.escort = ped;
  G.escortWait = false;
  G.escortHint = false;
}

/**
 * Begin the current mission (called by main.js when the intro card is
 * dismissed). This is the moment timers start — accepting a job costs no
 * time until Rui says go.
 */
export function startMission(G) {
  const def = currentMission(G);
  if (!def) return;
  G.card = null;
  if (def.id === 'docas') {
    G.stage = STAGE.GO;
    G.timer = def.timer;
    say(G, 'Dona Pilar', '“O relógio está a contar, Rui. Trezentos segundos — e é só azeite, desta vez.”');
  } else if (def.id === 'escolta') {
    G.stage = STAGE.ESCORT;
    spawnEscort(G);
    say(G, 'Dona Amélia', '“Devagar e ao meu lado, Rui. A avenida é longa para uma senhora.”');
  } else if (def.id === 'luzes') {
    G.stage = STAGE.COLLECT;
    G.timer = def.timer;
    G.collected = 0;
    G.crates = LIGHT_CRATES.map((c) => ({ x: c.x, z: c.z, taken: false }));
    say(G, 'Sr. Baltazar', '“Três caixas, Rui: Farol, Praça do Relógio e Docas. E de volta à minha banca!”');
  } else {
    G.stage = STAGE.GO;
  }
}

/**
 * Finish the current mission: the payout lands exactly once because every
 * caller reaches here through the phase transition that also leaves the
 * phase (stage becomes FREE), so a second step cannot pay again.
 */
function completeMission(G) {
  const def = currentMission(G);
  if (!def) return;
  G.money += def.payout;
  G.completed += 1;
  G.missionIdx += 1;
  G.timer = null;
  setCargo(G, null);
  G.collected = 0;
  G.crates = [];
  G.lastDone = {
    title: def.title, payout: def.payout, story: def.doneStory, payText: def.donePay,
    chain: def.id === 'luzes',
  };
  G.stage = STAGE.FREE;
  G.screen = 'done';
  // D2: only M1's delivery stands the patrol down — it is the one delivery
  // the PMPL was ever chasing.
  if (def.id === 'pacote') G.cooldownT = 5;
  say(G, def.doneWho, def.doneSay, 9);
  storeSave(G);
}

/**
 * Restore a browser save (save.js) into a fresh game state. Money, chain
 * position and upgrades come back; the paint colour is applied to the Vela
 * at once. A mission in progress is NOT restored mid-phase: the chain
 * resumes at the current mission's accept point (stage FREE, marker on its
 * giver) — except a fresh M1, which resumes at GO as it starts. A completed
 * chain (missionIdx 4) resumes FREE with no marker.
 */
export function applySave(G, sv) {
  G.money = sv.money;
  G.missionIdx = Math.max(0, Math.min(MISSIONS.length, Math.floor(sv.missionIdx)));
  G.completed = Math.max(0, Math.floor(sv.completed));
  const up = sv.upgrades ?? {};
  G.upgrades.paint = Math.max(0, Math.min(PAINTS.length - 1, Math.floor(up.paint ?? 0))) || 0;
  G.upgrades.tune = !!up.tune;
  G.upgrades.bumper = !!up.bumper;
  G.playerCar.body = [...PAINTS[G.upgrades.paint].body];
  setCargo(G, null);
  G.timer = null;
  G.collected = 0;
  G.crates = [];
  if (G.missionIdx >= MISSIONS.length) {
    G.stage = STAGE.FREE;
    G.markerX = null; G.markerZ = null;
  } else if (G.missionIdx > 0 || G.completed > 0) {
    G.stage = STAGE.FREE;
    const gp = giverPoint(G.missionIdx);
    G.markerX = gp.x; G.markerZ = gp.z;
  } else {
    G.stage = STAGE.GO;
    G.markerX = WORLD.stall.x; G.markerZ = WORLD.stall.z;
  }
}

/** A timed mission's clock ran out: no bust, no payout, no CALOR change — just the fail card and a retry at the giver. */
function failMission(G) {
  const def = currentMission(G);
  G.timer = null;
  setCargo(G, null);
  G.collected = 0;
  G.crates = [];
  G.stage = STAGE.FREE;
  G.card = {
    kicker: 'Trabalho falhado',
    title: def ? def.title : 'O trabalho',
    body: 'O prazo passou e o trabalho perdeu-se. Volta a falar com quem to deu — o trabalho continua aberto, à mesma hora dourada.',
    go: 'CONTINUAR — prime ENTER',
    action: 'fail',
  };
  G.screen = 'card';
}

/** Did anyone see the crime at (x, z)? Pedestrians close by, or any unit within earshot of its radio. */
function witnessed(G, x, z) {
  for (const ped of G.peds) if (Math.hypot(ped.x - x, ped.z - z) < 15) return true;
  for (const u of G.policeUnits) if (Math.hypot(u.x - x, u.z - z) < 34) return true;
  return false;
}

/**
 * Is Rui currently visible to the law or to a reporting pedestrian? Since P1-B this
 * is the real line-of-sight state: any active unit whose throttled LOS check
 * (actors.js) currently holds, or a pedestrian within 10 m (a witness at arm's
 * length needs no LOS check — if he can touch Rui, he can see him).
 */
function isSeen(G) {
  const t = G.player;
  for (const u of G.policeUnits) if (u.active && u.hasLOS) return true;
  for (const ped of G.peds) if (Math.hypot(ped.x - t.x, ped.z - t.z) < 10) return true;
  return false;
}

/** Does any active unit currently have line-of-sight on Rui? (Pedestrians excluded.) */
export function anyPoliceLOS(G) {
  for (const u of G.policeUnits) if (u.active && u.hasLOS) return true;
  return false;
}

/**
 * Bust reset (P1-D generalised): money, completed missions and upgrades are
 * KEPT; the current mission returns to its not-started state and Rui, the
 * Vela and the fleet go back to their starts. A mission in progress goes
 * back to stage FREE with the marker on its giver, so the retry is a fresh
 * accept. The one special case is M1 before it has ever been completed: it
 * is the opening job and needs no accept, so — exactly as P0 behaved — the
 * stage returns straight to GO with the marker on the stall. A bust while
 * carrying side-run supplies loses the cargo and starts a shorter cooldown.
 */
function resetAfterBust(G) {
  G.wanted = 0; G.bustMeter = 0; G.seenTimer = 0; G.decayClock = 0; G.cooldownT = 0;
  G.unseenT = 0; G.calorFlightT = 0; G.ramCooldownT = 0; G.bumpKind = null; G.seen = false;
  G.roadblock.active = false; G.roadblock.slots = null; G.roadblock.cooldownT = 0;
  G.heli.active = false; G.heli.state = 'return';
  if (G.cargo === 'mantimentos') G.sideCd = 30;
  setCargo(G, null);
  G.sideDest = null;
  G.timer = null;
  G.collected = 0;
  G.crates = [];
  G.shopOpen = false;
  if (G.escort) {
    const i = G.peds.indexOf(G.escort);
    if (i >= 0) G.peds.splice(i, 1);
    G.escort = null;
  }
  G.escortWait = false; G.escortHint = false;
  if (G.missionIdx === 0 && G.completed === 0) {
    G.stage = STAGE.GO;
  } else if (G.stage !== STAGE.FREE) {
    G.stage = STAGE.FREE;
  }
  G.player.mode = 'foot';
  G.player.x = WORLD.spawn.x; G.player.z = WORLD.spawn.z; G.player.speed = 0;
  G.player.moveSig = 0; G.player.moving = false;
  G.playerCar.x = WORLD.playerCar.x; G.playerCar.z = WORLD.playerCar.z;
  G.playerCar.heading = WORLD.playerCar.heading; G.playerCar.speed = 0;
  for (const u of G.policeUnits) {
    u.x = u.depot.x; u.z = u.depot.z; u.heading = u.depot.heading; u.speed = 0;
    u.hasLOS = false; u.unseenSec = 0; u.lastKnownAge = 999;
    u.mode = u.id === 0 ? 'patrol' : 'standby'; u.holdT = 0;
  }
  if (G.stage === STAGE.GO) { G.markerX = WORLD.stall.x; G.markerZ = WORLD.stall.z; }
  else if (G.missionIdx < MISSIONS.length) {
    const gp = giverPoint(G.missionIdx);
    G.markerX = gp.x; G.markerZ = gp.z;
  } else { G.markerX = null; G.markerZ = null; }
}

/** The mission + wanted step. Runs after actors move; spends G.interactPressed if a mission takes it. */
export function updateMission(G, dt) {
  const p = G.player;
  if (G.crimeTimer > 0) G.crimeTimer -= dt;
  if (G.bumpTimer > 0) G.bumpTimer += dt;
  if (G.bumpTimer > 1.2) G.bumpTimer = 0;
  // Clocks that only run in live play: the side-run cooldown and the timed
  // missions' budgets. A timer that runs out fails its mission (failMission)
  // — no bust, no payout, no CALOR change.
  if (G.sideCd > 0 && G.screen === 'play') G.sideCd = Math.max(0, G.sideCd - dt);
  if (G.timer != null && G.screen === 'play') {
    G.timer -= dt;
    if (G.timer <= 0) failMission(G);
  }

  // --- the garage shop, while open: E cycles the menu, ENTER (latched as
  // G.confirmPressed by main.js) buys or leaves. Mission phases below all
  // stand down while the menu is up; CALOR and the bust meter still run.
  const inShop = G.shopOpen;
  if (inShop) {
    if (G.interactPressed) {
      G.shopSel = (G.shopSel + 1) % 4;
      G.interactPressed = false;
    }
    if (G.confirmPressed) {
      shopActivate(G);
      G.confirmPressed = false;
    }
    G.prompt = null;
  }

  // --- GO: the pickup end of M1 (the stall lift) and M2 (the Docas crate).
  if (!inShop && G.stage === STAGE.GO && G.missionIdx === 1) {
    // M2: the lantern-oil crate on the Docas apron. This cargo is LEGAL —
    // the lift is no crime, sets no crime timer and raises no CALOR.
    const crate = LIGHT_CRATES[2]; // the Docas point (-38, 45)
    G.markerX = crate.x; G.markerZ = crate.z;
    const near = Math.hypot(p.x - crate.x, p.z - crate.z) < 3.1 && p.mode === 'foot';
    G.prompt = near ? '<b>E</b> — levantar a caixa de azeite das lanternas' : null;
    if (near && G.interactPressed && G.screen === 'play') {
      G.interactPressed = false;
      setCargo(G, 'azeite');
      G.stage = STAGE.DELIVER;
      say(G, 'Rui', 'Azeite de lanternas — carga legal. A PMPL que vá chatear outro.');
    }
  } else if (!inShop && G.stage === STAGE.GO) {
    // M1: the lift at the festival stall (P0 behaviour, unchanged).
    G.markerX = WORLD.stall.x; G.markerZ = WORLD.stall.z;
    const near = Math.hypot(p.x - WORLD.stall.x, p.z - WORLD.stall.z) < 3.1 && p.mode === 'foot';
    G.prompt = near ? '<b>E</b> — levantar o pacote da banca' : null;
    if (near && G.interactPressed) {
      setCargo(G, 'pacote');
      G.stage = STAGE.DELIVER;
      G.crimeTimer = 2.5; G.crimeX = WORLD.stall.x; G.crimeZ = WORLD.stall.z;
      if (witnessed(G, WORLD.stall.x, WORLD.stall.z)) {
        G.wanted = Math.max(G.wanted, 2);
        G.seenTimer = 0;
        say(G, 'Inspetora Quintela (rádio PMPL)', '“Central, aqui LUME-1: pacote levantado na Rua das Flores. A perseguir o Vela.”');
      } else {
        say(G, 'Rui', 'Ninguém viu. Agora é só entregar — devagar e sem dar nas vistas.');
      }
    }
  }

  // --- DELIVER: the garage end of M1 and M2. The branch completes only when
  // Rui (his position tracks the Vela while driving) is actually inside the
  // garage zone carrying the mission's cargo — staged shots set carrying
  // directly, and with missionIdx 0 that reads as the M1 package, as before.
  if (!inShop && G.stage === STAGE.DELIVER) {
    G.markerX = WORLD.garage.x; G.markerZ = WORLD.garage.z;
    G.prompt = null;
    const inZone = Math.abs(p.x - WORLD.garage.x) < WORLD.garage.halfX && Math.abs(p.z - WORLD.garage.z) < WORLD.garage.halfZ + 1.5;
    if (inZone && hasCargo(G)) {
      if (G.missionIdx === 0) completeMission(G);
      else if (G.missionIdx === 1 && G.cargo === 'azeite') completeMission(G);
    }
  }

  // --- ESCORT (M3): Dona Amélia walks her sidewalk; Rui's nearness is the throttle.
  if (!inShop && G.stage === STAGE.ESCORT) {
    G.prompt = null;
    const ped = G.escort;
    if (ped) {
      G.markerX = ped.x; G.markerZ = ped.z;
      const dRui = Math.hypot(p.x - ped.x, p.z - ped.z);
      if (ped.z >= 19) {
        // Arrived: she becomes an ordinary festival browser at the stalls
        // and updatePeds owns her from the next step on.
        ped.escort = false;
        ped.path = [[24.7, 17], [24.7, 24]];
        ped.wp = 1; ped.dir = 1;
        ped.behavior = 'browse'; ped.pauseDur = 3; ped.pauseT = 0;
        ped.speed = 1.3;
        G.escort = null;
        G.escortWait = false;
        completeMission(G);
      } else if (dRui <= ESCORT_RANGE) {
        G.escortWait = false;
        ped.heading = headingTo(ESCORT_TO.x - ped.x, ESCORT_TO.z - ped.z);
        ped.x += -Math.sin(ped.heading) * ESCORT_SPEED * dt;
        ped.z += Math.cos(ped.heading) * ESCORT_SPEED * dt;
        ped.walkPhase += dt * 6.4;
      } else {
        if (!G.escortHint) {
          G.escortHint = true;
          say(G, 'Dona Amélia', '“Espera por ti… não te afastes tanto, Rui.”');
        }
        G.escortWait = true;
      }
    }
  }

  // --- COLLECT (M4): three light crates by proximity (foot or car — Rui's
  // position tracks the Vela), then back to the stall with all three.
  if (!inShop && G.stage === STAGE.COLLECT) {
    G.prompt = null;
    if (G.screen === 'play') {
      for (const c of G.crates) {
        if (!c.taken && Math.hypot(p.x - c.x, p.z - c.z) <= 3.5) {
          c.taken = true;
          G.collected += 1;
          say(G, 'Rui', `Luzes: ${G.collected}/3 — ${G.collected < 3 ? 'ainda faltam caixas por recolher.' : 'todas! De volta à banca do Sr. Baltazar.'}`);
          break;
        }
      }
    }
    let best = null, bestD = Infinity;
    for (const c of G.crates) {
      if (c.taken) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) { G.markerX = best.x; G.markerZ = best.z; }
    else {
      G.markerX = WORLD.stall.x; G.markerZ = WORLD.stall.z;
      if (G.screen === 'play' && Math.hypot(p.x - WORLD.stall.x, p.z - WORLD.stall.z) <= 3.5) {
        completeMission(G);
      }
    }
  }

  // --- FREE: between missions the marker sits on the next giver; E at the
  // giver opens the intro card (the mission starts when the card closes).
  // A side run in progress (item 2b) owns the marker instead, and the stall
  // offers the next one whenever Rui is free, empty-handed and off cooldown.
  if (!inShop && G.stage === STAGE.FREE) {
    G.prompt = null;
    if (G.cargo === 'mantimentos' && G.sideDest) {
      // Side run under way: legal cargo, no timer — deliver by entering the
      // destination radius (foot or car). Pays exactly once: the delivery
      // transition itself clears the cargo.
      G.markerX = G.sideDest.x; G.markerZ = G.sideDest.z;
      if (G.screen === 'play' && Math.hypot(p.x - G.sideDest.x, p.z - G.sideDest.z) <= 4) {
        G.money += SIDE_PAY;
        G.sideRuns += 1;
        const destName = G.sideDest.name;
        setCargo(G, null);
        G.sideDest = null;
        G.sideCd = SIDE_COOLDOWN;
        say(G, 'Sr. Baltazar', `“Mantimentos entregues — ${destName}. Cento e vinte lumes; o festival agradece.”`);
        storeSave(G);
      }
    } else {
      const def = currentMission(G);
      if (!def) {
        G.markerX = null; G.markerZ = null;
      } else {
        const gp = giverPoint(G.missionIdx);
        G.markerX = gp.x; G.markerZ = gp.z;
        if (G.missionIdx > 0 && G.screen === 'play' && p.mode === 'foot'
          && Math.hypot(p.x - gp.x, p.z - gp.z) < 3.1) {
          G.prompt = `<b>E</b> — aceitar o trabalho: ${def.title}`;
          if (G.interactPressed) {
            G.interactPressed = false;
            openIntro(G);
          }
        }
      }
      // Side-run start at the mission stall. The giver's accept prompt (M4's
      // giver stands at this same stall) has already claimed the step when
      // it applies, so the run is only offered on a free prompt.
      if (!G.prompt && G.screen === 'play' && p.mode === 'foot' && G.sideCd <= 0
        && !hasCargo(G) && Math.hypot(p.x - WORLD.stall.x, p.z - WORLD.stall.z) < 3.1) {
        G.prompt = '<b>E</b> — corrida de mantimentos do festival (+120 lumes)';
        if (G.interactPressed) {
          G.interactPressed = false;
          G.sideDest = SIDE_DESTS[G.sideRuns % SIDE_DESTS.length];
          setCargo(G, 'mantimentos');
          say(G, 'Sr. Baltazar', `“Leva estes mantimentos: ${G.sideDest.name}. Cento e vinte lumes à entrega, Rui.”`);
        }
      }
    }
  }

  // --- opening the garage shop: on foot inside the garage zone, CALOR at
  // zero, empty-handed and not mid-delivery. It yields to any prompt a
  // mission already claimed this step (M2's giver stands in this same
  // zone, and her accept prompt wins near the door).
  if (!inShop && !G.prompt && G.screen === 'play' && p.mode === 'foot'
    && G.wanted === 0 && !hasCargo(G) && G.stage !== STAGE.DELIVER) {
    const inGarage = Math.abs(p.x - WORLD.garage.x) < WORLD.garage.halfX
      && Math.abs(p.z - WORLD.garage.z) < WORLD.garage.halfZ + 1.5;
    if (inGarage) {
      G.prompt = '<b>E</b> — garagem de Dona Pilar: afinar o Vela Sprint';
      if (G.interactPressed) {
        G.interactPressed = false;
        G.shopOpen = true;
        G.shopSel = 0;
        G.prompt = null;
        say(G, 'Dona Pilar', '“Vê lá do que o Vela precisa, Rui. Preços de amiga.”');
      }
    }
  }

  // --- CALOR: escalation, sight, decay (rules R1–R4 / D1–D2 in the header).
  if (G.ramCooldownT > 0) G.ramCooldownT -= dt;
  if (G.wanted > 0 && G.cooldownT <= 0) {
    const los = anyPoliceLOS(G);
    const seenNow = isSeen(G);
    const speedNow = p.mode === 'car' ? Math.abs(G.playerCar.speed) : Math.abs(p.speed);
    // D1: decay, one star per DECAY_SECONDS[level] of continuous unseen time.
    if (seenNow) { G.unseenT = 0; }
    else {
      G.unseenT += dt;
      if (G.unseenT >= (DECAY_SECONDS[G.wanted] ?? 9)) {
        G.wanted -= 1; G.unseenT = 0; G.calorFlightT = 0;
      }
    }
    // Legacy mirrors (older HUD/debug readers): seenTimer = time since last seen.
    G.seenTimer = seenNow ? 0 : G.unseenT;
    G.decayClock = G.unseenT;
    // R2 / R3: a hard ram, once per 5 s cooldown. bumpTimer is in its first frames
    // and bumpKind says what Rui hit (set by collideCars in actors.js).
    if (G.bumpTimer > 0 && G.bumpTimer < 0.05 && G.ramCooldownT <= 0) {
      if (G.bumpKind === 'police' && G.wanted >= 1) {
        G.wanted = Math.min(5, Math.max(G.wanted + 1, 3));
        G.ramCooldownT = 5; G.unseenT = 0;
      } else if (G.bumpKind === 'traffic' && G.wanted >= 2 && los) {
        G.wanted = Math.min(5, G.wanted + 1);
        G.ramCooldownT = 5; G.unseenT = 0;
      }
    }
    // R4: sustained flight in sight builds toward the next star.
    if (los && speedNow > 7 && G.wanted >= 2) {
      G.calorFlightT += dt;
      const need = G.wanted >= 4 ? 16 : 12;
      if (G.calorFlightT >= need && G.wanted < 5) { G.wanted += 1; G.calorFlightT = 0; G.unseenT = 0; }
    } else {
      G.calorFlightT = Math.max(0, G.calorFlightT - dt * 0.5);
    }
  }
  if (G.cooldownT > 0) {
    G.cooldownT -= dt;
    if (G.cooldownT <= 0) G.wanted = 0;
  }
  G.seen = G.wanted > 0 && isSeen(G);

  // --- being caught: any active unit holding contact with a slow Rui fills the meter.
  if (G.wanted > 0 && G.cooldownT <= 0 && G.screen === 'play') {
    const target = p.mode === 'car' ? G.playerCar : p;
    let d = Infinity;
    for (const u of G.policeUnits) if (u.active) d = Math.min(d, Math.hypot(u.x - target.x, u.z - target.z));
    const speed = p.mode === 'car' ? Math.abs(G.playerCar.speed) : p.speed;
    if (d < 3.8 && speed < 2.6) G.bustMeter += dt;
    else G.bustMeter = Math.max(0, G.bustMeter - dt * 1.6);
    if (G.bustMeter >= 3) {
      G.screen = 'busted';
      resetAfterBust(G);
    }
  } else if (G.screen === 'play') {
    G.bustMeter = Math.max(0, G.bustMeter - dt * 1.6);
  }

  // --- prompts that belong to the world, not the mission stage.
  if (G.screen === 'play' && !G.prompt) {
    if (p.mode === 'foot' && G.nearCar) G.prompt = '<b>E</b> — entrar no Vela Sprint';
    else if (p.mode === 'car' && Math.abs(G.playerCar.speed) < 1.2) G.prompt = '<b>E</b> — sair do Vela Sprint';
  }
  if (G.dialogue && G.time > G.dialogue.until) G.dialogue = null;

  // District name for the HUD corner.
  const nearFarol = Math.hypot(p.x - WORLD.farol.x, p.z - WORLD.farol.z) < 26;
  const nearClock = Math.hypot(p.x - WORLD.clockTower.x, p.z - WORLD.clockTower.z) < 20;
  if (nearFarol) G.district = 'FAROL DE PORTO LUME';
  else if (nearClock) G.district = 'PRAÇA DO RELÓGIO';
  else if (p.z > 44) G.district = 'DOCAS · PORTO LUME';
  else if (Math.abs(p.z - WORLD.northRoad.z) < 9) G.district = 'RUA DO RELÓGIO';
  else if (Math.abs(p.z - WORLD.southRoad.z) < 9) G.district = 'RUA DAS DOCAS';
  else if (Math.abs(p.x - WORLD.westStreet.x) < 9) G.district = 'RUA DO FAROL';
  else if (Math.abs(p.x - WORLD.eastStreet.x) < 9) G.district = 'AVENIDA LESTE';
  else if (Math.abs(p.x - WORLD.sideStreet.x) < 9) G.district = 'RUA DAS FLORES';
  else G.district = 'AVENIDA DO FAROL · PORTO LUME';
}

/**
 * The mission card's view of the chain (hud.js renders exactly this):
 * { kicker, title, obj, next } for the current mission and phase. A side
 * run in progress takes precedence over the FREE text; the timer readout
 * itself is hud.js's job (it appends the clock when G.timer is live).
 */
export function missionView(G) {
  if (G.cargo === 'mantimentos' && G.sideDest) {
    return {
      kicker: 'Corrida de mantimentos · Sr. Baltazar',
      title: 'Mantimentos do Festival',
      obj: `Entrega os mantimentos nas ${G.sideDest.name} (marcador dourado).`,
      next: 'Corrida livre e legal: sem CALOR — só os 120 lumes à chegada.',
    };
  }
  const def = currentMission(G);
  if (!def) {
    return {
      kicker: 'Festival salvo · Porto Lume',
      title: 'Porto Lume em Festa',
      obj: 'A cadeia de trabalhos está feita e o festival acende-se. Porto Lume é tua para passear — a pé ou no Vela Sprint.',
      next: 'Corridas de mantimentos na banca do Sr. Baltazar e a garagem de Dona Pilar continuam abertas.',
    };
  }
  const kicker = `Trabalho ${G.missionIdx + 1} · ${def.giver}`;
  const title = def.title;
  if (G.stage === STAGE.GO && def.id === 'docas') {
    return {
      kicker, title,
      obj: 'Vai às Docas e levanta a caixa de azeite das lanternas no cais (marcador dourado).',
      next: 'Carga legal: o levantamento não levanta CALOR. Entrega na garagem antes do prazo.',
    };
  }
  if (G.stage === STAGE.GO) {
    return {
      kicker, title,
      obj: 'Levanta o pacote da banca do festival na Rua das Flores (marcador dourado).',
      next: 'Depois: foge à PMPL e entrega na garagem de Dona Pilar.',
    };
  }
  if (G.stage === STAGE.DELIVER && def.id === 'docas') {
    return {
      kicker, title,
      obj: 'Entrega a caixa de azeite na garagem de Dona Pilar, na Avenida do Farol.',
      next: 'O prazo continua a contar até a caixa entrar na garagem.',
    };
  }
  if (G.stage === STAGE.DELIVER) {
    return {
      kicker, title,
      obj: 'Entrega o pacote na garagem de Dona Pilar, na Avenida do Farol.',
      next: 'O CALOR só arrefece fora da vista da patrulha e das testemunhas.',
    };
  }
  if (G.stage === STAGE.ESCORT) {
    const ped = G.escort;
    const d = ped ? Math.round(Math.hypot(G.player.x - ped.x, G.player.z - ped.z)) : 0;
    return {
      kicker, title,
      obj: G.escortWait
        ? `Dona Amélia parou e espera por ti — está a ${d} m. Aproxima-te para ela continuar.`
        : `Acompanha Dona Amélia pela Avenida Leste até às bancas (a ${d} m de ti).`,
      next: 'Ela só anda enquanto estiveres a menos de 14 m dela.',
    };
  }
  if (G.stage === STAGE.COLLECT) {
    return {
      kicker, title,
      obj: G.collected >= 3
        ? 'As três caixas estão contigo. Devolve-as à banca do Sr. Baltazar na Rua das Flores.'
        : `Recolhe as caixas de luzes do festival: ${G.collected}/3 recolhidas (o marcador aponta a mais perto).`,
      next: 'Farol, Praça do Relógio e Docas — e o prazo a contar.',
    };
  }
  // FREE.
  if (G.missionIdx === 0) {
    // Only a staged frame sits at FREE on mission 1 (the delivery shot):
    // keep the P0 free-roam text there.
    return {
      kicker, title,
      obj: 'Trabalho feito. Porto Lume é tua para passear — a pé ou no Vela Sprint.',
      next: 'Dona Pilar terá outro trabalho amanhã, à mesma hora dourada.',
    };
  }
  const gp = giverPoint(G.missionIdx);
  const place = G.missionIdx === 1 ? 'na garagem, na Avenida do Farol'
    : G.missionIdx === 2 ? 'no topo norte da Avenida Leste'
    : 'na banca da Rua das Flores';
  void gp;
  return {
    kicker, title,
    obj: `Fala com ${def.giver} ${place} para aceitar: ${def.title}.`,
    next: 'Entretanto: corridas de mantimentos na banca e a garagem de Dona Pilar estão abertas.',
  };
}
