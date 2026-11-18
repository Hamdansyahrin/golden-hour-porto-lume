// The HUD: DOM panels driven by game state — the mission card, the CALOR star meter with
// its sight state, the money purse, the vehicle card, prompts, dialogue and the card
// overlays for title / detained / job-done. Text is only rewritten when it changes, so a
// frame allocates nothing in the steady state.

import { STAGE, CALOR_LABEL } from './missions.js';
import { WORLD } from './city.js';

const OBJECTIVES = {
  [STAGE.GO]: {
    obj: 'Levanta o pacote da banca do festival na Rua das Flores (marcador dourado).',
    next: 'Depois: foge à PMPL e entrega na garagem de Dona Pilar.',
  },
  [STAGE.DELIVER]: {
    obj: 'Entrega o pacote na garagem de Dona Pilar, na Avenida do Farol.',
    next: 'O CALOR só arrefece fora da vista da patrulha e das testemunhas.',
  },
  [STAGE.FREE]: {
    obj: 'Trabalho feito. Porto Lume é tua para passear — a pé ou no Vela Sprint.',
    next: 'Dona Pilar terá outro trabalho amanhã, à mesma hora dourada.',
  },
};

export function createHud() {
  const el = (id) => document.getElementById(id);
  const mObj = el('mObj'), mNext = el('mNext'), stars = el('stars'), sight = el('sightState');
  const money = el('money'), district = el('district'), prompt = el('prompt'), dialogue = el('dialogue');
  const vCard = el('vehicleCard'), vName = el('vName'), vSpeed = el('vSpeed');
  const bustBar = el('bustBar'), bustFill = el('bustFill'), bustLabel = el('bustLabel');
  const titleCard = el('titleCard'), bustedCard = el('bustedCard'), doneCard = el('doneCard');
  const status = el('status');
  const cache = new Map();
  function set(elm, key, text) {
    if (cache.get(key) !== text) { cache.set(key, text); elm.textContent = text; }
  }
  function setHtml(elm, key, html) {
    if (cache.get(key) !== html) { cache.set(key, html); elm.innerHTML = html; }
  }
  function toggle(elm, key, show) {
    const v = show ? 'show' : 'hide';
    if (cache.get(key) !== v) { cache.set(key, v); elm.classList.toggle('hidden', !show); }
  }

  return {
    /** Push the current game state into the DOM. */
    update(G) {
      const o = OBJECTIVES[G.stage] ?? OBJECTIVES[STAGE.GO];
      set(mObj, 'obj', o.obj);
      set(mNext, 'next', 'Seguinte: ' + o.next);
      let starHtml = '';
      for (let i = 1; i <= 5; i++) starHtml += i <= G.wanted ? '<span class="on">★</span>' : '★';
      setHtml(stars, 'stars', starHtml);
      // Sight state (real LOS since P1-B) + the response doctrine for this level,
      // so the escalation is readable at a glance: stars, À VISTA / FORA DE VISTA,
      // and what the PMPL does next at this CALOR.
      set(sight, 'sight', G.wanted === 0 ? '' : (G.cooldownT > 0 ? 'A ARREFECER…' : `${G.seen ? 'À VISTA' : 'FORA DE VISTA'} · ${CALOR_LABEL[G.wanted] ?? ''}`));
      set(money, 'money', `${G.money} lumes`);
      set(district, 'district', G.district ?? '');
      toggle(prompt, 'prompt', !!G.prompt && G.screen === 'play');
      if (G.prompt) setHtml(prompt, 'promptHtml', G.prompt);
      toggle(dialogue, 'dlg', !!G.dialogue && G.screen === 'play');
      if (G.dialogue) setHtml(dialogue, 'dlgHtml', `<span class="who">${G.dialogue.who}:</span> ${G.dialogue.text}`);
      const inCar = G.player.mode === 'car';
      toggle(vCard, 'vcard', inCar && G.screen === 'play');
      if (inCar) {
        set(vName, 'vname', G.playerCar.name + ' · Vela');
        set(vSpeed, 'vspeed', String(Math.round(Math.abs(G.playerCar.speed) * 3.6)));
      }
      const busting = G.bustMeter > 0.05 && G.screen === 'play';
      toggle(bustBar, 'bbar', busting);
      toggle(bustLabel, 'blabel', busting);
      if (busting) bustFill.style.width = `${Math.min(100, (G.bustMeter / 3) * 100)}%`;
      toggle(titleCard, 'title', G.screen === 'title');
      toggle(bustedCard, 'busted', G.screen === 'busted');
      toggle(doneCard, 'done', G.screen === 'done');
      set(status, 'status', G.screen === 'title' ? 'Golden Hour. Prime Enter para começar.' : G.screen === 'busted' ? 'Detido pela PMPL.' : G.screen === 'done' ? 'Trabalho feito. Mais 450 lumes.' : 'A jogar.');
      void WORLD;
    },
  };
}
