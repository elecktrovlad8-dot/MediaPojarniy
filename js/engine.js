/**
 * МЕДИАПОЖАРНЫЙ — Игровой движок (ОД, действия 5 отделов, конверты, Дилемма № 6, Фаза 3 и исходы)
 * Строго соблюдает математическую модель и правила Части 1 «Вирус слуха» и совместим с будущими частями.
 */

import { store } from './state.js';

/** Подключаемые внешние обработчики (тосты, звук, синхронизация таймера) */
let hooks = {
  onToast: () => {},
  onSound: () => {},
  onPhaseChanged: () => {}
};

export function setEngineHooks(newHooks = {}) {
  hooks = { ...hooks, ...newHooks };
}

/* ============================================================================
   Вспомогательные вычисления и запросы состояния
   ============================================================================ */

export function getTotalRedTokens(game = store.game) {
  if (!game) return 0;
  return Object.values(game.locations).reduce((sum, loc) => sum + (loc.tokens || 0), 0);
}

export function getTotalRemainingAP(game = store.game) {
  if (!game) return 0;
  return Object.values(game.departments).reduce((sum, d) => sum + (d.ap || 0), 0);
}

export function getRoundRumors(episode = store.getEpisode(), round = store.game?.round || 1) {
  return episode.rumorDeck.filter((r) => r.round === round);
}

export function getUnopenedClues(episode = store.getEpisode(), game = store.game) {
  if (!game) return [];
  return episode.clueDeck.filter((c) => !game.clues.openedIds.includes(c.id));
}

export function getActionCost(action, game = store.game) {
  if (action.id === 'pr-refutation' && game?.draftPrepared && typeof action.draftCost === 'number') {
    return action.draftCost;
  }
  return action.cost;
}

export function getActiveDilemmaForRound(episode = store.getEpisode(), round = store.game?.round) {
  return (episode.dilemmas || []).find((d) => d.round === round) || null;
}

export function isDilemmaPending(episode = store.getEpisode(), game = store.game) {
  if (!game) return false;
  const dilemma = getActiveDilemmaForRound(episode, game.round);
  if (!dilemma) return false;
  return !game.dilemmaResolved[dilemma.id];
}

/**
 * Возвращает список локаций, допустимых для конкретного действия.
 */
export function getEligibleLocations(action, episode = store.getEpisode(), game = store.game) {
  if (!game) return [];
  return episode.locations.filter((loc) => {
    if (action.allowedEnvs && !action.allowedEnvs.includes(loc.env)) {
      return false;
    }
    if (action.allowedLocationIds && !action.allowedLocationIds.includes(loc.id)) {
      return false;
    }
    const locState = game.locations[loc.id];
    if (!locState) return false;

    if (action.type === 'add_shield') {
      return !locState.shielded;
    }
    if (action.type === 'remove_token') {
      return locState.tokens > 0;
    }
    if (action.type === 'remove_and_shield') {
      // Можно применить, если есть хотя бы 1 жетон ИЛИ ещё не стоит щит
      return locState.tokens > 0 || !locState.shielded;
    }
    if (action.type === 'remove_and_trust') {
      // Можно снять жетон и/или поднять доверие; по правилам приоритетно там, где есть жетон или локация разрешена
      return locState.tokens > 0 || game.trust < game.maxTrust;
    }
    return true;
  });
}

/**
 * Проверяет, доступно ли действие отдела в данный момент, и возвращает причину блокировки.
 */
export function checkActionAvailability(deptId, action, episode = store.getEpisode(), game = store.game) {
  if (!game || game.outcome) {
    return { allowed: false, reason: 'Партия завершена' };
  }

  const deptState = game.departments[deptId];
  if (!deptState) {
    return { allowed: false, reason: 'Отдел не найден' };
  }

  // Особое правило для Права этического вето (0 ОД в Раунде 3)
  if (action.type === 'ethical_veto') {
    const dilemma = getActiveDilemmaForRound(episode, 3);
    if (game.round !== 3) {
      return { allowed: false, reason: 'Доступно только в Раунде 3 (Карта № 6)' };
    }
    if (!dilemma || game.dilemmaResolved[dilemma.id]) {
      return { allowed: false, reason: 'Дилемма № 6 уже решена' };
    }
    return { allowed: true, reason: '' };
  }

  // Разрешаем действия в фазе обсуждения/выступлений (если ведущий сразу фиксирует ход), но предупреждаем про фазу 1/3
  if (game.phase === 'phase3') {
    return { allowed: false, reason: 'Идёт Фаза 3 — проверка поля' };
  }

  if (action.allowedRounds && !action.allowedRounds.includes(game.round)) {
    const rList = action.allowedRounds.join(' или ');
    return { allowed: false, reason: `Только в Раунде ${rList}` };
  }

  const cost = getActionCost(action, game);
  if (deptState.ap < cost) {
    return { allowed: false, reason: `Нужно ${cost} ОД (осталось ${deptState.ap})` };
  }

  if (action.oncePerGame && deptState.usedOnceActions.includes(action.id)) {
    return { allowed: false, reason: 'Уже использовано в этой партии' };
  }

  const trueCluesCount = game.clues.trueIds.length;
  if (action.minTrueClues && trueCluesCount < action.minTrueClues) {
    return {
      allowed: false,
      reason: `Нужно ≥ ${action.minTrueClues} истин. улик (сейчас ${trueCluesCount})`
    };
  }

  if (action.type === 'open_envelope') {
    if (getUnopenedClues(episode, game).length === 0) {
      return { allowed: false, reason: 'Все 8 конвертов уже вскрыты' };
    }
  }

  if (action.type === 'prepare_draft' && game.draftPrepared) {
    return { allowed: false, reason: 'Драфт уже подготовлен' };
  }

  if (action.type === 'official_refutation' && game.refutationPublished) {
    return { allowed: false, reason: 'Опровержение уже опубликовано' };
  }

  if (action.type === 'remove_split_envs') {
    const hasOnline = episode.locations.some(
      (l) => l.env === 'online' && game.locations[l.id].tokens > 0
    );
    const hasOffline = episode.locations.some(
      (l) => l.env === 'offline' && game.locations[l.id].tokens > 0
    );
    if (!hasOnline || !hasOffline) {
      return { allowed: false, reason: 'Нужны жетоны в обеих средах (онлайн и офлайн)' };
    }
  }

  if (
    ['remove_token', 'add_shield', 'remove_and_shield', 'remove_and_trust'].includes(action.type)
  ) {
    const eligible = getEligibleLocations(action, episode, game);
    if (eligible.length === 0) {
      return { allowed: false, reason: 'Нет подходящих целей на карте' };
    }
  }

  return { allowed: true, reason: '' };
}

/* ============================================================================
   Изменение Шкалы Доверия и мгновенная проверка поражения (Доверие = 0)
   ============================================================================ */

function applyTrustDelta(delta, reason, label = null) {
  const game = store.game;
  if (!game || delta === 0) return;

  const prev = game.trust;
  const next = Math.max(0, Math.min(game.maxTrust, prev + delta));
  game.trust = next;

  game.trustHistory.push({
    label: label || `Р${game.round}`,
    round: game.round,
    trust: next,
    delta: next - prev,
    reason
  });

  if (next > prev) {
    store.triggerTrustAnim('up');
  } else if (next < prev) {
    store.triggerTrustAnim('down');
  }

  if (next <= 0 && !game.outcome) {
    finalizeGame('lose_trust');
  }
}

/* ============================================================================
   Фаза 1 — Открытие и применение карт вбросов (2 карты на раунд)
   ============================================================================ */

export function revealRumor(rumorId) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game) return null;

  const rumor = ep.rumorDeck.find((r) => r.id === rumorId);
  if (!rumor) return null;

  if (!game.rumors.revealedIds.includes(rumorId)) {
    store.pushUndo(`Открытие карты № ${rumor.number}`);
    game.rumors.revealedIds.push(rumorId);
    store.addLogEntry({
      type: 'rumor',
      title: `Вброс № ${rumor.number}: «${rumor.title}»`,
      detail: rumor.effectText
    });
    hooks.onSound('alert');
    store.notify({ save: true, broadcast: true, reason: 'rumor_reveal' });
  }
  return rumor;
}

export function revealPhenomenonOnRumor(rumorId) {
  const game = store.game;
  if (!game) return;
  if (!game.rumors.revealedPhenomenaIds.includes(rumorId)) {
    game.rumors.revealedPhenomenaIds.push(rumorId);
    hooks.onSound('click');
    store.notify({ save: true, broadcast: true, reason: 'phenomenon_reveal' });
  }
}

export function applyRumorEffect(rumorId) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game) return false;

  const rumor = ep.rumorDeck.find((r) => r.id === rumorId);
  if (!rumor) return false;
  if (game.rumors.appliedIds.includes(rumorId)) return false;

  store.pushUndo(`Применение вброса № ${rumor.number}`);

  if (!game.rumors.revealedIds.includes(rumorId)) {
    game.rumors.revealedIds.push(rumorId);
  }

  const affectedLabels = [];

  for (const eff of rumor.effects || []) {
    if (eff.type === 'add_tokens') {
      const loc = ep.locations.find((l) => l.id === eff.locationId);
      if (loc && game.locations[loc.id]) {
        game.locations[loc.id].tokens += eff.amount;
        affectedLabels.push(`${loc.shortName} (+${eff.amount})`);
      }
    } else if (eff.type === 'change_trust') {
      applyTrustDelta(eff.delta, `Вброс № ${rumor.number}: «${rumor.title}»`);
      affectedLabels.push(`Доверие ${eff.delta > 0 ? '+' : ''}${eff.delta}`);
    } else if (eff.type === 'add_tokens_where_gte') {
      // Карта № 8 «Осадочек остался»: +1 жетон в каждую локацию с 2+ жетонами
      const matched = [];
      for (const loc of ep.locations) {
        const ls = game.locations[loc.id];
        if (ls && ls.tokens >= eff.threshold) {
          ls.tokens += eff.amount;
          matched.push(loc.shortName);
        }
      }
      if (matched.length > 0) {
        affectedLabels.push(`Очаги ≥ ${eff.threshold}: ${matched.join(', ')} (+${eff.amount})`);
      } else {
        affectedLabels.push('Нет очагов с ≥ 2 жетонами — эффект не сработал');
      }
    }
  }

  game.rumors.appliedIds.push(rumorId);

  store.addLogEntry({
    type: 'rumor',
    title: `Применён эффект карты № ${rumor.number}`,
    detail: affectedLabels.length ? affectedLabels.join(' • ') : rumor.effectText
  });

  hooks.onSound('rumor_apply');
  hooks.onToast({
    variant: 'danger',
    title: `Вброс № ${rumor.number} применён`,
    body: affectedLabels.join(' • ') || rumor.effectText
  });

  store.notify({ save: true, broadcast: true, reason: 'rumor_apply' });
  return true;
}

/* ============================================================================
   Переключение фаз раунда
   ============================================================================ */

export function setPhase(nextPhase) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || game.outcome) return;

  store.pushUndo(`Переход к фазе ${nextPhase}`);
  game.phase = nextPhase;

  if (nextPhase === 'phase2_speeches') {
    game.activeSpeakerIndex = 0;
  }

  if (nextPhase === 'phase3') {
    game.phase3State = {
      active: true,
      completed: false,
      stepIndex: -1,
      results: ep.locations.map((loc) => ({
        locationId: loc.id,
        name: loc.name,
        shortName: loc.shortName,
        checked: false,
        status: 'pending', // 'pending' | 'shielded' | 'explosion' | 'silence' | 'calm'
        note: 'Ожидает проверки'
      }))
    };
  }

  hooks.onPhaseChanged(nextPhase, game.round);
  store.notify({ save: true, broadcast: true, reason: 'phase_change' });
}

/* ============================================================================
   Этическая дилемма № 6 (Раунд 3) — Принять сделку (чёрный PR) vs Отказ / Вето
   ============================================================================ */

/**
 * Применяет выбор «Принять сделку» («Чёрный PR» / Эффект Стрейзанд):
 * - снимает выбранные ведущим жетоны (до 4 штук) с любых локаций;
 * - мгновенно снижает Шкалу Доверия на -3.
 */
export function resolveDilemmaAccept(dilemmaId, removalsMap = {}) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game) return false;

  const dilemma = (ep.dilemmas || []).find((d) => d.id === dilemmaId);
  if (!dilemma || game.dilemmaResolved[dilemmaId]) return false;

  store.pushUndo('Дилемма № 6: Принять сделку (чёрный PR)');

  let totalRemoved = 0;
  const removedNotes = [];
  for (const [locId, count] of Object.entries(removalsMap)) {
    const n = Math.max(0, Number(count) || 0);
    if (n > 0 && game.locations[locId]) {
      const actual = Math.min(game.locations[locId].tokens, n);
      game.locations[locId].tokens -= actual;
      totalRemoved += actual;
      const loc = ep.locations.find((l) => l.id === locId);
      if (actual > 0 && loc) {
        removedNotes.push(`${loc.shortName} (-${actual})`);
      }
    }
  }

  game.stats.tokensRemoved += totalRemoved;
  game.dilemmaResolved[dilemmaId] = {
    choice: 'accepted_dark_pr',
    label: 'Принята сделка «чёрного PR» (Эффект Стрейзанд)',
    removed: totalRemoved,
    trustDelta: dilemma.acceptOption.trustDelta
  };

  if (!game.rumors.appliedIds.includes(dilemma.rumorId)) {
    game.rumors.appliedIds.push(dilemma.rumorId);
  }

  applyTrustDelta(
    dilemma.acceptOption.trustDelta,
    'Эффект Стрейзанд: утечка сделки о сносе канала (-3)',
    'Дилемма № 6'
  );

  store.addLogEntry({
    type: 'dilemma',
    title: 'ДИЛЕММА № 6: Принята сделка «Снос канала» (Эффект Стрейзанд!)',
    detail: `Снято жетонов: ${totalRemoved} (${removedNotes.join(', ') || 'нет'}). Утечка в городские паблики → Доверие -3!`
  });

  hooks.onSound('explosion');
  hooks.onToast({
    variant: 'danger',
    title: 'ЭФФЕКТ СТРЕЙЗАНД (-3 к Доверию)!',
    body: `Снято ${totalRemoved} жетонов, но скрины бот-атаки утекли в городские паблики: «Вуз затыкает рты цензурой».`
  });

  if (!game.outcome && game.phase === 'phase2_dilemma') {
    game.phase = 'phase2_speeches';
    hooks.onPhaseChanged('phase2_speeches', game.round);
  }

  store.notify({ save: true, broadcast: true, reason: 'dilemma_accept' });
  return true;
}

/**
 * Применяет выбор «Отказаться / Право этического вето Стола № 5 (0 ОД)»:
 * - +1 к Шкале Доверия;
 * - +1 красный жетон в Потоковый чат.
 */
export function resolveDilemmaReject(dilemmaId, usedVeto = true) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game) return false;

  const dilemma = (ep.dilemmas || []).find((d) => d.id === dilemmaId);
  if (!dilemma || game.dilemmaResolved[dilemmaId]) return false;

  store.pushUndo('Дилемма № 6: Отказ / Этическое вето');

  const opt = dilemma.rejectOption;
  if (game.locations[opt.addLocationId]) {
    game.locations[opt.addLocationId].tokens += opt.addAmount;
  }

  game.dilemmaResolved[dilemmaId] = {
    choice: usedVeto ? 'ethical_veto' : 'rejected',
    label: usedVeto
      ? 'Право этического вето Стола № 5 (0 ОД)'
      : 'Штаб отказался от чёрного PR',
    trustDelta: opt.trustDelta
  };

  if (!game.rumors.appliedIds.includes(dilemma.rumorId)) {
    game.rumors.appliedIds.push(dilemma.rumorId);
  }

  applyTrustDelta(
    opt.trustDelta,
    'Этическое вето на «чёрный PR» (+1)',
    'Дилемма № 6'
  );

  store.addLogEntry({
    type: 'dilemma',
    title: usedVeto
      ? 'ДИЛЕММА № 6: Стол № 5 применил «Право этического вето» (0 ОД)'
      : 'ДИЛЕММА № 6: Штаб отказался от сделки',
    detail: 'Эффект Стрейзанд предотвращён! Шкала Доверия +1, Потоковый чат +1 красный жетон.'
  });

  hooks.onSound('shield');
  hooks.onToast({
    variant: 'synergy',
    title: 'Этическое вето сработало (+1 к Доверию)',
    body: 'Сделка заблокирована (0 ОД). Штраф Стрейзанд предотвращён; +1 жетон в Потоковый чат.'
  });

  if (!game.outcome && game.phase === 'phase2_dilemma') {
    game.phase = 'phase2_speeches';
    hooks.onPhaseChanged('phase2_speeches', game.round);
  }

  store.notify({ save: true, broadcast: true, reason: 'dilemma_reject' });
  return true;
}

/* ============================================================================
   Вскрытие конверта улики (Стол № 1 OSINT, строго 1 ОД = 1 конверт)
   ============================================================================ */

export function openClueEnvelope(clueId) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || game.outcome) return { ok: false, error: 'Партия завершена' };

  const deptId = 'dept-1';
  const deptState = game.departments[deptId];
  if (!deptState || deptState.ap < 1) {
    return { ok: false, error: 'У Стола № 1 (OSINT) недостаточно ОД (нужно 1 ОД на 1 конверт).' };
  }

  const clue = ep.clueDeck.find((c) => c.id === clueId);
  if (!clue) return { ok: false, error: 'Конверт не найден' };
  if (game.clues.openedIds.includes(clueId)) {
    return { ok: false, error: 'Этот конверт уже был вскрыт' };
  }

  store.pushUndo(`OSINT: Вскрытие конверта № ${clue.number}`);

  deptState.ap -= 1;
  deptState.spokeThisRound = true;
  game.clues.openedIds.push(clueId);

  let synergy = null;
  if (clue.isTrue) {
    game.clues.trueIds.push(clueId);
    const count = game.clues.trueIds.length;
    synergy = ep.synergyMilestones?.[count] || null;
    if (synergy && !game.stats.synergiesTriggered.includes(count)) {
      game.stats.synergiesTriggered.push(count);
    }
    hooks.onSound('clue_true');
  } else {
    game.clues.falseIds.push(clueId);
    hooks.onSound('clue_false');
  }

  store.addLogEntry({
    type: 'clue',
    title: `Конверт № ${clue.number} («${clue.coverTitle}») — ${clue.isTrue ? 'ИСТИННАЯ УЛИКА' : 'ЛОЖНЫЙ СЛЕД'}`,
    detail: clue.isTrue
      ? `Добавлено на Доску доказательств (${game.clues.trueIds.length}/3 для победы).`
      : `Отсеяно в сброс. Ловушка: ${clue.trapName}.`
  });

  if (synergy) {
    hooks.onToast({
      variant: 'synergy',
      title: synergy.title,
      body: synergy.message,
      duration: 7500
    });
  }

  store.notify({ save: true, broadcast: true, reason: 'clue_open' });
  return { ok: true, clue, synergy };
}

/* ============================================================================
   Выполнение действий всех 5 отделов
   ============================================================================ */

export function executeDepartmentAction(deptId, actionId, params = {}) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || game.outcome) return { ok: false, error: 'Партия завершена' };

  const dept = ep.departments.find((d) => d.id === deptId);
  const action = dept?.actions.find((a) => a.id === actionId);
  if (!dept || !action) return { ok: false, error: 'Действие не найдено' };

  const avail = checkActionAvailability(deptId, action, ep, game);
  if (!avail.allowed) {
    return { ok: false, error: avail.reason };
  }

  const cost = getActionCost(action, game);
  const deptState = game.departments[deptId];

  store.pushUndo(`Стол № ${dept.number}: ${action.name}`);

  // Списание ОД и отметка участия спикера
  deptState.ap -= cost;
  deptState.spokeThisRound = true;
  if (action.oncePerGame) {
    deptState.usedOnceActions.push(action.id);
  }

  let logDetail = '';

  switch (action.type) {
    case 'remove_token': {
      const loc = ep.locations.find((l) => l.id === params.locationId);
      const locState = game.locations[params.locationId];
      if (!loc || !locState || locState.tokens <= 0) {
        store.undo();
        return { ok: false, error: 'В выбранной локации нет красных жетонов' };
      }
      const removed = Math.min(locState.tokens, action.amount || 1);
      locState.tokens -= removed;
      game.stats.tokensRemoved += removed;
      logDetail = `Локация «${loc.shortName}»: -${removed} красный жетон (${cost} ОД).`;
      hooks.onSound('action_ok');
      break;
    }

    case 'remove_split_envs': {
      // Аналитическая сводка OSINT: 1 онлайн + 1 офлайн
      const locOn = ep.locations.find((l) => l.id === params.onlineLocationId && l.env === 'online');
      const locOff = ep.locations.find((l) => l.id === params.offlineLocationId && l.env === 'offline');
      if (
        !locOn ||
        !locOff ||
        game.locations[locOn.id].tokens <= 0 ||
        game.locations[locOff.id].tokens <= 0
      ) {
        store.undo();
        return { ok: false, error: 'Выберите по 1 локации с жетонами в Онлайн и Офлайн средах' };
      }
      game.locations[locOn.id].tokens -= 1;
      game.locations[locOff.id].tokens -= 1;
      game.stats.tokensRemoved += 2;
      logDetail = `Онлайн «${locOn.shortName}» (-1) + Офлайн «${locOff.shortName}» (-1) (${cost} ОД).`;
      hooks.onSound('action_ok');
      break;
    }

    case 'add_shield': {
      const loc = ep.locations.find((l) => l.id === params.locationId);
      const locState = game.locations[params.locationId];
      if (!loc || !locState) {
        store.undo();
        return { ok: false, error: 'Локация не выбрана' };
      }
      locState.shielded = true;
      locState.lastPulse = 'shield';
      game.stats.shieldsPlaced += 1;
      logDetail = `На локацию «${loc.shortName}» установлен зелёный «Щит модерации» до конца раунда (${cost} ОД).`;
      hooks.onSound('shield');
      break;
    }

    case 'remove_and_shield': {
      const loc = ep.locations.find((l) => l.id === params.locationId);
      const locState = game.locations[params.locationId];
      if (!loc || !locState) {
        store.undo();
        return { ok: false, error: 'Локация не выбрана' };
      }
      const removed = Math.min(locState.tokens, action.amount || 2);
      locState.tokens -= removed;
      locState.shielded = true;
      locState.lastPulse = 'shield';
      game.stats.tokensRemoved += removed;
      game.stats.shieldsPlaced += 1;
      logDetail = `Локация «${loc.shortName}»: -${removed} жетон(ов) + «Щит модерации» (${cost} ОД).`;
      hooks.onSound('shield');
      break;
    }

    case 'remove_and_trust': {
      const loc = ep.locations.find((l) => l.id === params.locationId);
      const locState = game.locations[params.locationId];
      if (!loc || !locState) {
        store.undo();
        return { ok: false, error: 'Локация не выбрана' };
      }
      const removed = Math.min(locState.tokens, action.amount || 1);
      locState.tokens -= removed;
      game.stats.tokensRemoved += removed;
      applyTrustDelta(action.trustDelta || 1, `Стол № ${dept.number}: ${action.name}`);
      logDetail = `Локация «${loc.shortName}» (-${removed} жетон) и Шкала Доверия +${action.trustDelta} (${cost} ОД).`;
      hooks.onSound('trust_up');
      break;
    }

    case 'bias_analysis': {
      game.stats.biasesAnalyzed += 1;
      const named = params.phenomenonName ? ` (${params.phenomenonName})` : '';
      applyTrustDelta(action.trustDelta || 1, `Разбор когнитивного искажения${named}`);
      // Если был выбран вброс для раскрытия феномена — открываем его на карточке
      if (params.rumorId && !game.rumors.revealedPhenomenaIds.includes(params.rumorId)) {
        game.rumors.revealedPhenomenaIds.push(params.rumorId);
      }
      logDetail = `Диагностировано когнитивное искажение${named} → Шкала Доверия +1 (${cost} ОД).`;
      hooks.onSound('trust_up');
      break;
    }

    case 'prepare_draft': {
      game.draftPrepared = true;
      logDetail = 'Подготовлен драфт «Сэндвича правды»! В Раунде 4 Официальное опровержение будет стоить 1 ОД вместо 2 ОД.';
      hooks.onSound('clue_true');
      hooks.onToast({
        variant: 'synergy',
        title: 'Драфт опровержения готов!',
        body: 'В Раунде 4 «Официальное опровержение» Стола № 4 будет стоить 1 ОД вместо 2 ОД.'
      });
      break;
    }

    case 'official_refutation': {
      // Снимаем ВСЕ оставшиеся красные жетоны с карты
      let cleared = 0;
      for (const loc of ep.locations) {
        const ls = game.locations[loc.id];
        if (ls) {
          cleared += ls.tokens;
          ls.tokens = 0;
          ls.lastPulse = 'clear';
        }
      }
      game.stats.tokensRemoved += cleared;
      game.refutationPublished = true;
      store.ui.refutationAnim = true;
      setTimeout(() => {
        store.ui.refutationAnim = false;
      }, 1400);

      logDetail = `Зачитан «Сэндвич правды» на базе ${game.clues.trueIds.length} истинных улик! С карты мгновенно снято ${cleared} красных жетонов.`;

      store.addLogEntry({
        type: 'action',
        title: `Стол № 4: ОФИЦИАЛЬНОЕ ОПРОВЕРЖЕНИЕ ОПУБЛИКОВАНО!`,
        detail: logDetail
      });

      // Финальная проверка исхода партии
      const outcome =
        game.trust >= ep.initialState.winMinTrust
          ? 'full_win'
          : game.trust >= 1
          ? 'pyrrhic_win'
          : 'lose_trust';

      finalizeGame(outcome);
      store.notify({ save: true, broadcast: true, reason: 'official_refutation' });
      return { ok: true, outcome, cleared };
    }

    default:
      break;
  }

  store.addLogEntry({
    type: 'action',
    title: `Стол № ${dept.number} (${dept.shortName}): ${action.name}`,
    detail: logDetail
  });

  hooks.onToast({
    variant: 'brand',
    title: `Стол № ${dept.number}: ${action.name}`,
    body: logDetail
  });

  store.notify({ save: true, broadcast: true, reason: 'dept_action' });
  return { ok: true };
}

/* ============================================================================
   Фаза 3 — Пошаговая проверка поля (Информационный взрыв 4+ и Эффект молчания 2–3)
   ============================================================================ */

export function runNextPhase3Step() {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || game.outcome || game.phase !== 'phase3') return null;

  const p3 = game.phase3State;
  const nextIndex = p3.stepIndex + 1;

  if (nextIndex >= ep.locations.length) {
    return finishPhase3AndAdvanceRound();
  }

  store.pushUndo(`Фаза 3: Проверка локации ${nextIndex + 1}`);

  const loc = ep.locations[nextIndex];
  const locState = game.locations[loc.id];
  const entry = p3.results[nextIndex];
  p3.stepIndex = nextIndex;
  entry.checked = true;

  if (locState.shielded) {
    entry.status = 'shielded';
    entry.note = `Защищена «Щитом модерации» (${locState.tokens} жетон.) — оба триггера заблокированы`;
    hooks.onSound('shield');
  } else if (locState.tokens >= 4) {
    // Информационный взрыв (4+): Доверие -2; Эффект молчания сверху НЕ добавляется!
    entry.status = 'explosion';
    entry.note = `ИНФОРМАЦИОННЫЙ ВЗРЫВ (${locState.tokens} жетон.) → Шкала Доверия -2!`;
    locState.lastPulse = 'explosion';
    game.stats.explosions += 1;

    applyTrustDelta(-2, `Информационный взрыв: ${loc.shortName} (${locState.tokens} жетон.)`, `Р${game.round} Ф3`);

    store.addLogEntry({
      type: 'phase3',
      title: `ВЗРЫВ в локации «${loc.shortName}» (${locState.tokens} жетон.)`,
      detail: 'Шкала Доверия падает на -2. Эффект молчания сверху не добавляется.'
    });
    hooks.onSound('explosion');
  } else if (locState.tokens >= 2 && locState.tokens <= 3) {
    // Эффект молчания (2–3): +1 красный жетон
    const before = locState.tokens;
    locState.tokens += 1;
    entry.status = 'silence';
    entry.note = `Эффект молчания (было ${before}) → +1 красный жетон (стало ${locState.tokens})`;
    locState.lastPulse = 'silence';
    game.stats.silenceTriggers += 1;

    store.addLogEntry({
      type: 'phase3',
      title: `Эффект молчания: «${loc.shortName}»`,
      detail: `На незащищённой локации было ${before} жетон. → добавлен +1 красный жетон (стало ${locState.tokens}).`
    });
    hooks.onSound('rumor_apply');
  } else {
    entry.status = 'calm';
    entry.note = `Спокойно (${locState.tokens} жетон.) — триггеров нет`;
    hooks.onSound('click');
  }

  if (nextIndex === ep.locations.length - 1) {
    p3.completed = true;
  }

  store.notify({ save: true, broadcast: true, reason: 'phase3_step' });
  return entry;
}

/**
 * Прогоняет все оставшиеся локации Фазы 3 сразу (для экономии времени на паре).
 */
export function runAllPhase3Steps() {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || game.outcome || game.phase !== 'phase3') return;

  while (game.phase3State.stepIndex + 1 < ep.locations.length && !game.outcome) {
    runNextPhase3Step();
  }
}

/**
 * Завершает Фазу 3: автоматически снимает все зелёные щиты, проверяет дедлайн Раунда 4
 * или переводит партию в следующий раунд с полным обновлением 2 ОД у каждого отдела.
 */
export function finishPhase3AndAdvanceRound() {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || game.outcome) return null;

  store.pushUndo(`Завершение Раунда ${game.round}`);

  // 1. В конце Фазы 3 все зелёные щиты снимаются с поля
  let removedShields = 0;
  for (const loc of ep.locations) {
    if (game.locations[loc.id].shielded) {
      game.locations[loc.id].shielded = false;
      removedShields += 1;
    }
    game.locations[loc.id].lastPulse = null;
  }

  // 2. Если это был Раунд 4 — проверяем дедлайн 18:00
  if (game.round >= ep.initialState.totalRounds) {
    if (
      game.refutationPublished &&
      game.clues.trueIds.length >= ep.initialState.winMinTrueClues &&
      getTotalRedTokens(game) === 0
    ) {
      const outcome = game.trust >= ep.initialState.winMinTrust ? 'full_win' : 'pyrrhic_win';
      finalizeGame(outcome);
    } else {
      finalizeGame('lose_deadline');
    }
    store.notify({ save: true, broadcast: true, reason: 'game_finished' });
    return game.outcome;
  }

  // 3. Переход к следующему раунду (неиспользованные ОД сгорают и не переносятся)
  game.round += 1;
  game.phase = 'phase1';
  game.activeSpeakerIndex = 0;
  game.phase3State = { active: false, completed: false, stepIndex: -1, results: [] };

  for (const dept of ep.departments) {
    const ds = game.departments[dept.id];
    ds.ap = ep.initialState.apPerDepartment;
    ds.spokeThisRound = false;
  }

  store.addLogEntry({
    type: 'system',
    title: `Начался Раунд ${game.round} из ${ep.initialState.totalRounds}`,
    detail: `Снято отработавших щитов: ${removedShields}. Каждому отделу начислено ровно по ${ep.initialState.apPerDepartment} ОД. Вспомните «Эстафету голоса»!`
  });

  hooks.onPhaseChanged('phase1', game.round);
  hooks.onSound('round_next');
  hooks.onToast({
    variant: 'brand',
    title: `Раунд ${game.round} открыт!`,
    body: 'Все щиты сняты, ОД обновлены (2 ОД на отдел). Откройте 2 новые карты вбросов.'
  });

  store.notify({ save: true, broadcast: true, reason: 'round_advance' });
  return 'next_round';
}

/* ============================================================================
   Финализация партии (Полная победа / Пиррова победа / Поражение)
   ============================================================================ */

export function finalizeGame(outcomeCode) {
  const game = store.game;
  if (!game) return;

  game.outcome = outcomeCode;
  game.phase = 'finished';
  game.finishedAt = new Date().toISOString();

  const labels = {
    full_win: 'ПОЛНАЯ ПОБЕДА АНТИКРИЗИСНОГО ШТАБА',
    pyrrhic_win: 'ЧАСТИЧНАЯ («ПИРРОВА») ПОБЕДА',
    lose_trust: 'ПОРАЖЕНИЕ: Шкала Доверия упала до 0',
    lose_deadline: 'ПОРАЖЕНИЕ: Дедлайн 18:00 просрочен'
  };

  store.addLogEntry({
    type: 'system',
    title: `ИТОГ ПАРТИИ: ${labels[outcomeCode] || outcomeCode}`,
    detail: `Истинных улик: ${game.clues.trueIds.length}/4 • Доверие: ${game.trust}/${game.maxTrust} • Осталось жетонов: ${getTotalRedTokens(game)}`
  });

  if (outcomeCode === 'full_win') {
    hooks.onSound('victory');
  } else if (outcomeCode === 'pyrrhic_win') {
    hooks.onSound('clue_true');
  } else {
    hooks.onSound('defeat');
  }

  store.setAudienceSpotlight(null);
  store.ui.modal = null;
  store.screen = 'debrief';
}

/* ============================================================================
   Эстафета голоса и ручные правки ведущего (из Шторки / режима правки)
   ============================================================================ */

export function toggleSpeakerRelay(deptId) {
  const game = store.game;
  if (!game || !game.departments[deptId]) return;
  store.pushUndo('Отметка «Эстафеты голоса»');
  game.departments[deptId].spokeThisRound = !game.departments[deptId].spokeThisRound;
  store.notify({ save: true, broadcast: true, reason: 'relay_toggle' });
}

export function setSpeakerNameForRound(deptId, round, speakerName) {
  const game = store.game;
  if (!game || !game.departments[deptId]) return;
  game.departments[deptId].speakersByRound[round] = speakerName;
  store.notify({ save: true, broadcast: false, reason: 'speaker_name' });
}

export function manualAdjustLocationTokens(locationId, delta) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || !game.locations[locationId]) return;

  const loc = ep.locations.find((l) => l.id === locationId);
  const nextVal = Math.max(0, game.locations[locationId].tokens + delta);
  if (nextVal === game.locations[locationId].tokens) return;

  store.pushUndo(`Ручная правка: ${loc?.shortName} (${delta > 0 ? '+' : ''}${delta})`);
  game.locations[locationId].tokens = nextVal;

  store.addLogEntry({
    type: 'system',
    title: `Ручная правка ведущего: «${loc?.shortName}»`,
    detail: `Красные жетоны ${delta > 0 ? '+' : ''}${delta} (теперь ${nextVal}).`
  });

  hooks.onSound('click');
  store.notify({ save: true, broadcast: true, reason: 'manual_tokens' });
}

export function manualToggleLocationShield(locationId) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || !game.locations[locationId]) return;

  const loc = ep.locations.find((l) => l.id === locationId);
  store.pushUndo(`Ручная правка щита: ${loc?.shortName}`);
  const next = !game.locations[locationId].shielded;
  game.locations[locationId].shielded = next;

  store.addLogEntry({
    type: 'system',
    title: `Ручная правка ведущего: «${loc?.shortName}»`,
    detail: next ? 'Щит модерации установлен вручную.' : 'Щит модерации снят вручную.'
  });

  hooks.onSound(next ? 'shield' : 'click');
  store.notify({ save: true, broadcast: true, reason: 'manual_shield' });
}

export function manualAdjustTrust(delta) {
  const game = store.game;
  if (!game || delta === 0) return;

  store.pushUndo(`Ручная правка Доверия (${delta > 0 ? '+' : ''}${delta})`);
  applyTrustDelta(delta, 'Ручная корректировка ведущего');
  store.addLogEntry({
    type: 'system',
    title: `Ручная правка ведущего: Шкала Доверия`,
    detail: `Изменение на ${delta > 0 ? '+' : ''}${delta} (теперь ${game.trust}/${game.maxTrust}).`
  });
  hooks.onSound(delta > 0 ? 'trust_up' : 'rumor_apply');
  store.notify({ save: true, broadcast: true, reason: 'manual_trust' });
}

export function manualAdjustDeptAP(deptId, delta) {
  const game = store.game;
  const ep = store.getEpisode();
  if (!game || !game.departments[deptId]) return;

  const dept = ep.departments.find((d) => d.id === deptId);
  const nextVal = Math.max(0, Math.min(4, game.departments[deptId].ap + delta));
  if (nextVal === game.departments[deptId].ap) return;

  store.pushUndo(`Ручная правка ОД: Стол № ${dept?.number}`);
  game.departments[deptId].ap = nextVal;
  hooks.onSound('click');
  store.notify({ save: true, broadcast: true, reason: 'manual_ap' });
                                    }
