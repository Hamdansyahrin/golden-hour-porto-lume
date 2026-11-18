// The circular minimap: a canvas dial, north up, that projects Porto Lume's road
// network (the boulevard, Rua das Flores and the P1-A grid around them), the Farol,
// the clock tower and the dry canal, plus a blip for every actor — Rui (white arrow),
// the PMPL patrol (flashing blue/red), traffic (pale dots), pedestrians (tiny sand
// dots) and the gold mission target. A search ring pulses around Rui while the CALOR
// is up and he is out of sight.

import { ROAD_BANDS, WORLD } from './city.js';

const RANGE = 105; // world metres shown from centre to rim

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const C = S / 2;
  const scale = (C - 6) / RANGE;
  const px = (wx, cx) => C + (wx - cx) * scale;
  const pz = (wz, cz) => C + (wz - cz) * scale;

  function dot(x, y, r, colour) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    draw(G) {
      const cx = G.player.x, cz = G.player.z;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, C - 2, 0, Math.PI * 2);
      ctx.clip();
      // Ground and streets: every road band in the network. (P1-C: the road
      // grey lifts a step and the ground green deepens a step, so the network
      // reads as a network at contact-sheet scale, not as texture.)
      ctx.fillStyle = '#2e4638';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#4a4550';
      for (const band of ROAD_BANDS.h) ctx.fillRect(0, pz(band.z - band.half, cz), S, band.half * 2 * scale);
      for (const band of ROAD_BANDS.v) ctx.fillRect(px(band.x - band.half, cx), 0, band.half * 2 * scale, S);
      // The dry canal strip at the east edge and the harbour water at the south.
      ctx.fillStyle = '#8a6f4d';
      ctx.fillRect(px(WORLD.canal.xMin, cx), 0, (WORLD.canal.xMax - WORLD.canal.xMin) * scale, S);
      ctx.fillStyle = '#57707e';
      ctx.fillRect(0, pz(68, cz), S, S - pz(68, cz));
      dot(px(WORLD.farol.x, cx), pz(WORLD.farol.z, cz), 4, '#e8e0cc');
      dot(px(WORLD.clockTower.x, cx), pz(WORLD.clockTower.z, cz), 3, '#ffbe3c');
      // Search ring while wanted and unseen.
      if (G.wanted > 0 && !G.seen && G.cooldownT <= 0) {
        ctx.strokeStyle = 'rgba(255,90,60,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(C, C, 16 + Math.sin(G.time * 3) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Mission target.
      if (G.markerX !== null && G.markerX !== undefined) {
        const mx = px(G.markerX, cx), mz = pz(G.markerZ, cz);
        const d = Math.hypot(mx - C, mz - C);
        const rim = C - 12;
        const kx = d > rim ? C + ((mx - C) / d) * rim : mx;
        const kz = d > rim ? C + ((mz - C) / d) * rim : mz;
        // Mission marker (P1-C): a bigger gold chevron on a dark backing
        // triangle, so the target survives downscaling and rim clamping.
        ctx.fillStyle = '#201404';
        ctx.beginPath();
        ctx.moveTo(kx, kz - 8); ctx.lineTo(kx + 7, kz + 6); ctx.lineTo(kx - 7, kz + 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffbe3c';
        ctx.beginPath();
        ctx.moveTo(kx, kz - 6); ctx.lineTo(kx + 5, kz + 4); ctx.lineTo(kx - 5, kz + 4);
        ctx.closePath(); ctx.fill();
      }
      for (const ped of G.peds) dot(px(ped.x, cx), pz(ped.z, cz), 1.6, '#d8b98a');
      for (const car of G.traffic) dot(px(car.x, cx), pz(car.z, cz), 2.6, '#cfd4d8');
      // The player's own car, when he is out of it.
      if (G.player.mode === 'foot') dot(px(G.playerCar.x, cx), pz(G.playerCar.z, cz), 3.6, '#37c8d8');
      // Police: one blip per unit, alternating blue/red like its light bar,
      // on a white halo disc so a unit reads against any ground colour;
      // standby units at their depots blink slower so the active response reads.
      for (const cop of G.policeUnits) {
        const blink = cop.active && G.wanted > 0 ? Math.floor(G.time * 2.4) % 2 : Math.floor(G.time * 0.8) % 2;
        dot(px(cop.x, cx), pz(cop.z, cz), 5.4, 'rgba(255,255,255,0.85)');
        dot(px(cop.x, cx), pz(cop.z, cz), 4.2, blink ? '#3f7dff' : '#ff4030');
        dot(px(cop.x, cx), pz(cop.z, cz), 1.8, '#ffffff');
      }
      // ÁGUIA-1 while airborne: a larger gold diamond with a dark rim and a
      // white core over its shadow position — the one blip that is not a car.
      if (G.heli.state !== 'parked') {
        const hx = px(G.heli.x, cx), hz = pz(G.heli.z, cz);
        ctx.fillStyle = '#201404';
        ctx.beginPath();
        ctx.moveTo(hx, hz - 7.5); ctx.lineTo(hx + 6, hz); ctx.lineTo(hx, hz + 7.5); ctx.lineTo(hx - 6, hz);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd23c';
        ctx.beginPath();
        ctx.moveTo(hx, hz - 6); ctx.lineTo(hx + 4.8, hz); ctx.lineTo(hx, hz + 6); ctx.lineTo(hx - 4.8, hz);
        ctx.closePath(); ctx.fill();
        dot(hx, hz, 1.6, '#ffffff');
      }
      // Rui: a white arrow on his heading.
      ctx.translate(C, C);
      ctx.rotate(headingAngle(G.player.heading));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // Rim and north tick.
      ctx.strokeStyle = 'rgba(255,210,130,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd98f';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillText('N', C - 3, 13);
    },
  };
}

/** Canvas rotation for an actor heading: north (-z) is up, heading 0 faces +z (south). */
function headingAngle(h) {
  // Forward is (-sin h, cos h); on the dial that vector is (x, +z-down) so the arrow
  // rotation from straight-up (-z) is atan2(fx, -fz).
  const fx = -Math.sin(h), fz = Math.cos(h);
  return Math.atan2(fx, -fz);
}
