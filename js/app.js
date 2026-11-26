/**
 * МЕДИАПОЖАРНЫЙ — Точка входа, роутинг, Шторка ведущего, горячие клавиши и фоновая анимация
 */

import { store } from './state.js';
import {
  applyRumorEffect,
  executeDepartmentAction,
  finishPhase3AndAdvanceRound,
  getActiveDilemmaForRound,
  getRoundRumors,
  getTotalRemainingAP,
  isDilemmaPending,
  manualAdjustDeptAP,
  manualAdjustLocationTokens,
  manualAdjustTrust,
  manualToggleLocationShield,
  openClueEnvelope,
  resolveDilemmaAccept,
  resolveDilemmaReject,
  revealPhenomenonOnRumor,
  revealRumor,
  runAllPhase3Steps,
  runNextPhase3Step,
  setEngineHooks,
  setPhase,
  toggleSpeakerRelay
} from './engine.js';
import { escapeHtml, hydrateMediaSlots, initMediaOverrides } from './media.js';
import { sound } from './sound.js';
import { timer } from './timer.js';

import { renderHubView } from './ui/hubView.js';
import { renderSetupView } from './ui/setupView.js';
import { renderStoryView } from './ui/storyView.js';
import { renderBoardView } from './ui/boardView.js';
import { renderAudienceView } from './ui/audienceView.js';
import { renderModalRoot, renderPrintableHandouts } from './ui/modalsView.js';
import { renderDebriefView, renderPrintableReport } from './ui/debriefView.js';

const appRoot = document.getElementById('app-root');
const gmDrawerRoot = document.getElementById('gm-drawer-root');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');
const printRoot = document.getElementById('print-root');

/** Внутренний флаг раскрытия шпаргалки конвертов внутри Шторки ведущего */
let gmSpoilersExpanded = false;

/* ============================================================================
   Система уведомлений (Тосты и оповещения о синергии)
   ============================================================================ */

export function showToast({ variant = 'default', title = '', body = '', duration = 4500 }) {
  if (!toastRoot || store.isAudienceWindow) return;

  const toast = document.createElement('div');
  const variantClass =
    variant === 'synergy'
      ? 'toast-synergy'
      : variant === 'danger'
      ? 'toast-danger'
      : variant === 'brand'
      ? 'toast-brand'
      : '';

  toast.className = `toast ${variantClass}`;
  toast.innerHTML = `
    <div style="flex:1; min-width:0;">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      ${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}
    </div>
    <button type="button" class="btn btn-xs btn-ghost" aria-label="Скрыть уведомление">✕</button>
  `;

  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 220);
  };

  toast.querySelector('button')?.addEventListener('click', dismiss);
  toastRoot.appendChild(toast);

  // Не даём стеку разрастаться больше 4 уведомлений
  while (toastRoot.children.length > 4) {
    toastRoot.firstElementChild?.remove();
  }

  window.setTimeout(dismiss, duration);
}

/* ============================================================================
   Набор всех действий контроллера (передаётся в View-модули)
   ============================================================================ */

const actions = {
  /* --- Навигация и настройки --- */
  onGoHub() {
    timer.stopAll();
    store.closeModal();
    store.setScreen('hub');
  },

  onSelectEpisode(episodeId) {
    sound.play('click');
    store.selectEpisode(episodeId);
    store.setScreen('setup');
  },

  onStartGame(episodeId, setupOptions, goToStory = true) {
    sound.play('round_next');
    store.startNewGame(episodeId, setupOptions, goToStory);
    timer.configureForPhase('phase1', false);
  },

  onContinueGame() {
    sound.play('click');
    store.continueSavedGame();
    if (store.game && !store.game.outcome) {
      timer.configureForPhase(store.game.phase, false);
    }
  },

  onDiscardSaved() {
    store.openModal('confirm', {
      title: 'Сбросить сохранённую партию?',
      message:
        'Текущий прогресс незавершённой партии в локальном хранилище будет удалён без возможности восстановления.',
      confirmLabel: 'Да, сбросить партию',
      danger: true,
      onConfirm: () => {
        timer.stopAll();
        store.clearSavedGame();
        store.closeModal();
        showToast({ variant: 'brand', title: 'Сохранение очищено', body: 'Можно запускать новую партию.' });
      }
    });
  },

  onNewGame() {
    timer.stopAll();
    store.closeModal();
    store.setScreen('setup');
  },

  onToggleTheme() {
    const next = store.prefs.theme === 'light' ? 'dark' : 'light';
    store.savePrefs({ theme: next });
    sound.play('click');
  },

  onToggleSound() {
    const enabled = sound.toggleMute();
    showToast({
      title: enabled ? 'Звук включён' : 'Звук выключен (Mute)',
      duration: 2200
    });
  },

  onToggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {
        showToast({ variant: 'brand', title: 'Полноэкранный режим недоступен', body: 'Нажмите F11 в браузере.' });
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  },

  onToggleEditMode() {
    const next = !store.prefs.editMode;
    store.savePrefs({ editMode: next });
    sound.play('click');
    showToast({
      variant: next ? 'danger' : 'default',
      title: next ? 'Режим ручной правки включён' : 'Режим ручной правки выключен',
      body: next
        ? 'На карточках локаций, отделов и Шкале Доверия появились кнопки ±.'
        : 'Случайные ручные изменения заблокированы.'
    });
  },

  onToggleGmDrawer() {
    sound.play('click');
    store.toggleGmDrawer();
  },

  onOpenAudienceWindow() {
    const ok = store.openAudienceWindow();
    if (ok) {
      showToast({
        variant: 'synergy',
        title: 'Окно для проектора открыто',
        body: 'Перетащите новое окно на расширенный экран проектора и нажмите там «Полный экран».'
      });
    } else {
      showToast({
        variant: 'danger',
        title: 'Браузер заблокировал всплывающее окно',
        body: 'Разрешите всплывающие окна для этой страницы в адресной строке и нажмите кнопку снова.'
      });
    }
  },

  /* --- Сюжетный пролог --- */
  onSetSlide(index) {
    sound.play('click');
    store.setStorySlide(index);
  },

  onFinishPrologue() {
    sound.play('round_next');
    store.setScreen('board');
    timer.configureForPhase(store.game?.phase || 'phase1', false);
    showToast({
      variant: 'brand',
      title: 'Раунд 1 открыт!',
      body: 'Откройте 2 карты вбросов Фазы 1 в правой панели.'
    });
  },

  /* --- Таймеры --- */
  onToggleMainTimer() {
    timer.toggleMain();
  },

  onAddMainTimer(sec = 30) {
    timer.addMainSeconds(sec);
  },

  onResetMainTimer() {
    timer.resetMain();
  },

  onToggleSpeakerTimer() {
    const isFinal = store.game?.round === 4;
    const defaultSec = timer.getSpeakerDefaultSec(isFinal && store.ui.modal?.type === 'refutation');
    if (!timer.speakerRunning && timer.speakerRemaining <= 0) {
      timer.startSpeaker(defaultSec);
    } else {
      timer.toggleSpeaker();
    }
  },

  onStartSpeakerTimer(sec = 25) {
    timer.startSpeaker(sec);
  },

  onResetSpeakerTimer(sec = 25) {
    timer.resetSpeaker(sec);
  },

  /* --- Игровой процесс, фазы, вбросы, конверты, действия --- */
  onUndo() {
    const undoneLabel = store.undo();
    if (undoneLabel) {
      sound.play('click');
      showToast({
        variant: 'brand',
        title: 'Шаг отменён (Undo)',
        body: `Откат: «${undoneLabel}»`
      });
    }
  },

  onOpenRumorModal(rumorId) {
    revealRumor(rumorId);
    store.setAudienceSpotlight({ type: 'rumor', payload: { rumorId } });
    store.openModal('rumor', { rumorId });
  },

  onRevealPhenomenon(rumorId) {
    revealPhenomenonOnRumor(rumorId);
  },

  onApplyRumor(rumorId) {
    applyRumorEffect(rumorId);
    if (!store.game?.outcome) {
      // Оставляем карточку открытой на секунду или закрываем, чтобы аудитория увидела карту
      store.closeModal();
    }
  },

  onOpenEnvelopesModal() {
    sound.play('click');
    store.setAudienceSpotlight(null);
    store.openModal('envelopes', {});
  },

  onOpenClueEnvelope(clueId) {
    const res = openClueEnvelope(clueId);
    if (!res.ok) {
      showToast({ variant: 'danger', title: 'Невозможно вскрыть конверт', body: res.error });
      return;
    }
    store.setAudienceSpotlight({ type: 'clue_reveal', payload: { clueId } });
    store.openModal('clue_reveal', { clueId, justOpened: true });
  },

  onInspectClueModal(clueId) {
    sound.play('click');
    store.setAudienceSpotlight({ type: 'clue_reveal', payload: { clueId } });
    store.openModal('clue_reveal', { clueId, justOpened: false });
  },

  onOpenDilemmaModal(dilemmaId) {
    sound.play('alert');
    store.setAudienceSpotlight({ type: 'dilemma', payload: { dilemmaId } });
    store.openModal('dilemma', { dilemmaId });
  },

  onResolveDilemmaAccept(dilemmaId, removalsMap) {
    resolveDilemmaAccept(dilemmaId, removalsMap);
    if (!store.game?.outcome) {
      store.closeModal();
    }
  },

  onResolveDilemmaReject(dilemmaId, usedVeto = true) {
    resolveDilemmaReject(dilemmaId, usedVeto);
    if (!store.game?.outcome) {
      store.closeModal();
    }
  },

  onTriggerDepartmentAction(deptId, actionId) {
    const ep = store.getEpisode();
    const dept = ep.departments.find((d) => d.id === deptId);
    const action = dept?.actions.find((a) => a.id === actionId);
    if (!dept || !action) return;

    if (action.type === 'open_envelope') {
      actions.onOpenEnvelopesModal();
      return;
    }

    if (action.type === 'ethical_veto') {
      const dilemma = getActiveDilemmaForRound(ep, 3);
      if (dilemma) {
        actions.onOpenDilemmaModal(dilemma.id);
      }
      return;
    }

    if (action.type === 'official_refutation') {
      sound.play('click');
      store.setAudienceSpotlight({ type: 'refutation', payload: {} });
      store.openModal('refutation', {});
      return;
    }

    sound.play('click');
    store.openModal('dept_action', { deptId, actionId });
  },

  onExecuteDeptAction(deptId, actionId, params) {
    const res = executeDepartmentAction(deptId, actionId, params);
    if (!res.ok) {
      showToast({ variant: 'danger', title: 'Действие не выполнено', body: res.error });
      return;
    }
    if (!store.game?.outcome) {
      store.closeModal();
    }
  },

  onToggleRelay(deptId) {
    sound.play('click');
    toggleSpeakerRelay(deptId);
  },

  onRequestPhaseChange(nextPhase) {
    const ep = store.getEpisode();
    const game = store.game;
    if (!game) return;

    // 1. Проверка неприменённых вбросов при выходе из Фазы 1
    if (game.phase === 'phase1' && nextPhase !== 'phase1') {
      const unapplied = getRoundRumors(ep, game.round).filter(
        (r) => !r.isDilemma && !game.rumors.appliedIds.includes(r.id)
      );
      if (unapplied.length > 0) {
        store.openModal('confirm', {
          title: 'Не все карты вбросов применены',
          message: `В Раунде ${game.round} ещё не применены эффекты карт: ${unapplied
            .map((r) => `№ ${r.number}`)
            .join(', ')}. Всё равно перейти к Фазе 2?`,
          confirmLabel: 'Перейти без применения',
          cancelLabel: 'Вернуться к вбросам',
          onConfirm: () => {
            store.closeModal();
            proceedPhaseChange(nextPhase);
          }
        });
        return;
      }
    }

    // 2. Проверка неиспользованных ОД и нерешённой Дилеммы № 6 перед Фазой 3
    if (nextPhase === 'phase3') {
      const remAp = getTotalRemainingAP(game);
      const pendingDil = isDilemmaPending(ep, game);
      if (pendingDil || remAp > 0) {
        const warnings = [];
        if (pendingDil) {
          warnings.push('Этическая дилемма № 6 в Раунде 3 ещё не решена.');
        }
        if (remAp > 0) {
          warnings.push(`У столов осталось неиспользованных ОД: ${remAp} (они сгорят и не перенесутся).`);
        }
        store.openModal('confirm', {
          title: 'Перейти к Фазе 3 (Проверка поля)?',
          message: `${warnings.join(' ')} Вы уверены, что все дежурные спикеры завершили выступления?`,
          confirmLabel: 'Да, запустить Фазу 3',
          cancelLabel: 'Продолжить Фазу 2',
          danger: true,
          onConfirm: () => {
            store.closeModal();
            proceedPhaseChange('phase3');
          }
        });
        return;
      }
    }

    proceedPhaseChange(nextPhase);
  },

  onOpenPhase3Modal() {
    store.setAudienceSpotlight({ type: 'phase3', payload: {} });
    store.openModal('phase3', {});
  },

  onPhase3NextStep() {
    runNextPhase3Step();
  },

  onPhase3RunAll() {
    runAllPhase3Steps();
  },

  onPhase3Finish() {
    const res = finishPhase3AndAdvanceRound();
    if (res === 'next_round') {
      store.closeModal();
    }
  },

  /* --- Ручные правки ведущего --- */
  onManualLocationTokens(locId, delta) {
    manualAdjustLocationTokens(locId, delta);
  },

  onManualLocationShield(locId) {
    manualToggleLocationShield(locId);
  },

  onManualTrust(delta) {
    manualAdjustTrust(delta);
  },

  onManualDeptAP(deptId, delta) {
    manualAdjustDeptAP(deptId, delta);
  },

  /* --- Модалки справочника, журнала, онбординга и печати --- */
  onOpenLog() {
    sound.play('click');
    store.openModal('log', {});
  },

  onOpenRules(tab = 'rules') {
    sound.play('click');
    store.openModal('rules', { tab });
  },

  onOpenOnboarding() {
    sound.play('click');
    store.openModal('onboarding', {});
  },

  onFinishOnboarding() {
    store.savePrefs({ onboardingDone: true });
    store.closeModal();
  },

  onCloseModal() {
    sound.play('click');
    store.closeModal();
  },

  onMediaUpdated(msg) {
    showToast({ variant: 'synergy', title: 'Медиа обновлено', body: msg });
    store.notify({ save: false, broadcast: true, reason: 'media_updated' });
  },

  onPrintHandouts() {
    const ep = store.getEpisode();
    renderPrintableHandouts(printRoot, ep);
    window.setTimeout(() => window.print(), 80);
  },

  onPrintReport() {
    const ep = store.getEpisode();
    if (!store.game) return;
    renderPrintableReport(printRoot, ep, store.game);
    window.setTimeout(() => window.print(), 80);
  },

  onExportJson() {
    const ep = store.getEpisode();
    const game = store.game;
    if (!game) return;

    const payload = {
      platform: 'Медиапожарный',
      exportedAt: new Date().toISOString(),
      episode: { id: ep.id, number: ep.number, title: ep.title, subtitle: ep.subtitle },
      outcome: game.outcome,
      finalTrust: game.trust,
      maxTrust: game.maxTrust,
      trueCluesFound: game.clues.trueIds.length,
      falseCluesFiltered: game.clues.falseIds.length,
      dilemmaResolved: game.dilemmaResolved,
      stats: game.stats,
      trustHistory: game.trustHistory,
      log: game.log
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mediapozharny-report-${ep.id}-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast({
      variant: 'synergy',
      title: 'Отчёт партии сохранён (JSON)',
      body: 'Файл загружен на ваш компьютер.'
    });
  }
};

function proceedPhaseChange(nextPhase) {
  setPhase(nextPhase);
  const ep = store.getEpisode();

  if (nextPhase === 'phase2_dilemma') {
    const dilemma = getActiveDilemmaForRound(ep, store.game.round);
    if (dilemma) {
      actions.onOpenDilemmaModal(dilemma.id);
    }
  } else if (nextPhase === 'phase3') {
    actions.onOpenPhase3Modal();
  }
}

/* ============================================================================
   Шторка ведущего (правый выдвижной слой, клавиша H)
   ============================================================================ */

function renderGmDrawer() {
  if (store.isAudienceWindow) return;

  const isOpen = Boolean(store.ui.gmDrawerOpen);
  gmDrawerRoot.classList.toggle('is-open', isOpen);
  gmDrawerRoot.setAttribute('aria-hidden', String(!isOpen));

  if (!isOpen) {
    gmDrawerRoot.innerHTML = '';
    return;
  }

  const ep = store.getEpisode();
  const game = store.game;
  const roundBrief = game ? ep.roundBriefs?.[game.round] : ep.roundBriefs?.[1];
  const hidePhen = Boolean(store.prefs.hidePhenomena);
  const volumePct = Math.round(sound.getVolume() * 100);

  gmDrawerRoot.innerHTML = `
    <div class="gm-drawer-backdrop" data-action="close-gm"></div>
    <div class="gm-drawer-panel" role="complementary" aria-label="Шторка подсказок ведущего">
      <div class="gm-drawer-header">
        <div>
          <span class="badge badge-brand">ТОЛЬКО ДЛЯ ВЕДУЩЕГО • КЛАВИША H</span>
          <h2 style="font-size:1.1rem; margin-top:4px;">Шторка подсказок и контроля</h2>
        </div>
        <button type="button" class="btn btn-icon btn-ghost" data-action="close-gm" aria-label="Закрыть шторку">✕</button>
      </div>

      <div class="gm-drawer-body">
        <!-- 1. Напоминания по текущему раунду -->
        ${
          roundBrief
            ? `
              <section class="gm-section">
                <div class="gm-section-title">🎯 ${escapeHtml(roundBrief.title)}</div>
                <div style="font-size:0.84rem; font-weight:700; color:var(--text-primary);">${escapeHtml(roundBrief.theme)}</div>
                <ul class="gm-bullet-list">
                  ${roundBrief.gmTips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
                </ul>
              </section>
            `
            : ''
        }

        <!-- 2. Красные флаги SMM и чек-лист Медиации -->
        <section class="gm-section">
          <div class="gm-section-title">🚩 Красные флаги SMM (Стол № 2)</div>
          <ul class="gm-bullet-list">
            <li><strong>Агрессия или сарказм</strong> в адрес комментаторов → действие не засчитывать.</li>
            <li><strong>Голословные угрозы</strong> («подадим в суд / всех вычислим») без фактов.</li>
            <li><strong>Слабая оправдательная позиция</strong> вместо спокойного буферного ответа (Holding Statement).</li>
          </ul>
        </section>

        <!-- 3. Быстрые ручные корректировки и настройки эфира -->
        <section class="gm-section">
          <div class="gm-section-title">⚙️ Быстрое управление</div>

          <div class="toggle-row" style="background:var(--bg-surface);">
            <span style="font-size:0.82rem; font-weight:700;">Скрывать феномены на вбросах</span>
            <button type="button" class="btn btn-xs ${hidePhen ? 'btn-success' : ''}" data-gm-action="toggle-hide-phen">
              ${hidePhen ? 'Скрыто ✓' : 'Открыто'}
            </button>
          </div>

          <div class="toggle-row" style="background:var(--bg-surface);">
            <span style="font-size:0.82rem; font-weight:700;">Громкость звуков (${volumePct}%)</span>
            <input type="range" min="0" max="100" value="${volumePct}" data-gm-action="volume" style="width:120px; accent-color:var(--accent-brand);" />
          </div>

          ${
            game
              ? `
                <div class="toggle-row" style="background:var(--bg-surface);">
                  <span style="font-size:0.82rem; font-weight:700;">Шкала Доверия (${game.trust}/${game.maxTrust})</span>
                  <div style="display:flex; gap:6px;">
                    <button type="button" class="btn btn-xs btn-outline-danger" data-gm-action="trust-dec">-1</button>
                    <button type="button" class="btn btn-xs btn-outline-success" data-gm-action="trust-inc">+1</button>
                  </div>
                </div>

                <div class="toggle-row" style="background:var(--bg-surface);">
                  <span style="font-size:0.82rem; font-weight:700;">Режим правки карты (± жетоны / щиты)</span>
                  <button type="button" class="btn btn-xs ${store.prefs.editMode ? 'is-active' : ''}" data-gm-action="toggle-edit">
                    ${store.prefs.editMode ? 'Включён' : 'Выключен'}
                  </button>
                </div>
              `
              : ''
          }
        </section>

        <!-- 4. Шпаргалка вердиктов 8 конвертов (с дополнительной защитой от случайного показа на проекторе) -->
        <section class="gm-section">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div class="gm-section-title">🔒 Вердикты 8 конвертов (спойлер!)</div>
            <button type="button" class="btn btn-xs" data-gm-action="toggle-spoilers">
              ${gmSpoilersExpanded ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          ${
            gmSpoilersExpanded
              ? `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px; font-size:0.78rem;">
                  ${ep.clueDeck
                    .map(
                      (c) => `
                    <div style="padding:6px 8px; border-radius:6px; background:${c.isTrue ? 'var(--accent-success-soft)' : 'var(--accent-danger-soft)'}; border:1px solid ${c.isTrue ? 'var(--accent-success-border)' : 'var(--accent-danger-border)'};">
                      <strong>№ ${c.number} (${c.isTrue ? 'ИСТИНА' : 'ШУМ'}):</strong> ${escapeHtml(c.coverTitle)}
                      ${c.trapName ? `<div style="color:var(--text-muted);">Ловушка: ${escapeHtml(c.trapName)}</div>` : ''}
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
              : `<div style="font-size:0.78rem; color:var(--text-muted);">Скрыто на случай, если шторка открыта при дублировании экрана на проектор.</div>`
          }
        </section>

        ${
          game
            ? `
              <section class="gm-section">
                <div class="gm-section-title">🔄 Управление партией</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                  <button type="button" class="btn btn-xs" data-gm-action="open-hotkeys">⌨️ Горячие клавиши</button>
                  <button type="button" class="btn btn-xs btn-outline-danger" data-gm-action="reset-game">Сбросить партию</button>
                </div>
              </section>
            `
            : ''
        }
      </div>
    </div>
  `;

  gmDrawerRoot.querySelectorAll('[data-action="close-gm"]').forEach((el) => {
    el.addEventListener('click', () => store.toggleGmDrawer(false));
  });

  gmDrawerRoot.querySelector('[data-gm-action="toggle-hide-phen"]')?.addEventListener('click', () => {
    store.savePrefs({ hidePhenomena: !store.prefs.hidePhenomena });
  });

  gmDrawerRoot.querySelector('[data-gm-action="volume"]')?.addEventListener('input', (e) => {
    sound.setVolume(Number(e.target.value) / 100);
  });

  gmDrawerRoot.querySelector('[data-gm-action="trust-dec"]')?.addEventListener('click', () => {
    actions.onManualTrust(-1);
  });

  gmDrawerRoot.querySelector('[data-gm-action="trust-inc"]')?.addEventListener('click', () => {
    actions.onManualTrust(1);
  });

  gmDrawerRoot.querySelector('[data-gm-action="toggle-edit"]')?.addEventListener('click', () => {
    actions.onToggleEditMode();
  });

  gmDrawerRoot.querySelector('[data-gm-action="toggle-spoilers"]')?.addEventListener('click', () => {
    gmSpoilersExpanded = !gmSpoilersExpanded;
    renderGmDrawer();
  });

  gmDrawerRoot.querySelector('[data-gm-action="open-hotkeys"]')?.addEventListener('click', () => {
    store.toggleGmDrawer(false);
    actions.onOpenRules('hotkeys');
  });

  gmDrawerRoot.querySelector('[data-gm-action="reset-game"]')?.addEventListener('click', () => {
    store.toggleGmDrawer(false);
    actions.onDiscardSaved();
  });
}

/* ============================================================================
   Главный цикл рендеринга (роутер экранов)
   ============================================================================ */

function renderApp(currentStore = store, reason = 'init') {
  // Точечное обновление цифр таймера без перерисовки DOM
  if (reason === 'timer_tick') {
    timer.paintDom(currentStore.ui.timerSnapshot);
    return;
  }

  document.documentElement.setAttribute('data-theme', currentStore.prefs.theme || 'dark');
  document.body.className = `screen-${currentStore.screen}`;

  if (currentStore.isAudienceWindow) {
    renderAudienceView(appRoot);
    timer.paintDom(currentStore.ui.timerSnapshot);
    return;
  }

  if (reason === 'gm_drawer') {
    renderGmDrawer();
    return;
  }

  if (reason === 'modal_open' || reason === 'modal_close') {
    renderModalRoot(modalRoot, actions);
    return;
  }

  // Полный рендер активного экрана
  switch (currentStore.screen) {
    case 'hub':
      renderHubView(appRoot, actions);
      break;
    case 'setup':
      renderSetupView(appRoot, actions);
      break;
    case 'story':
      renderStoryView(appRoot, actions);
      break;
    case 'board':
      renderBoardView(appRoot, actions);
      break;
    case 'debrief':
      renderDebriefView(appRoot, actions);
      break;
    default:
      renderHubView(appRoot, actions);
      break;
  }

  renderGmDrawer();
  renderModalRoot(modalRoot, actions);
  hydrateMediaSlots(appRoot);
  timer.paintDom(currentStore.ui.timerSnapshot);
}

/* ============================================================================
   Глобальные горячие клавиши ведущего
   ============================================================================ */

function initHotkeys() {
  if (store.isAudienceWindow) return;

  window.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toUpperCase();
    const isTyping =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      Boolean(e.target?.isContentEditable);

    // Esc всегда закрывает модалку или Шторку ведущего
    if (e.key === 'Escape') {
      if (store.ui.modal) {
        actions.onCloseModal();
        return;
      }
      if (store.ui.gmDrawerOpen) {
        store.toggleGmDrawer(false);
        return;
      }
    }

    if (isTyping) return;

    // Ctrl+Z / Cmd+Z — отмена хода (Undo)
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
      if (store.screen === 'board' && store.canUndo()) {
        e.preventDefault();
        actions.onUndo();
      }
      return;
    }

    // Не перехватываем системные комбинации браузера (Ctrl+R, Ctrl+F и т. п.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Листание слайдов пролога стрелками
    if (store.screen === 'story' && !store.ui.modal) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const slidesCount = store.getEpisode().storySlides?.length || 1;
        if (store.storySlideIndex < slidesCount - 1) {
          actions.onSetSlide(store.storySlideIndex + 1);
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (store.storySlideIndex > 0) {
          actions.onSetSlide(store.storySlideIndex - 1);
        }
        return;
      }
    }

    // Space — старт/пауза основного таймера на игровом поле
    if (e.code === 'Space' && store.screen === 'board' && !store.ui.modal) {
      e.preventDefault();
      actions.onToggleMainTimer();
      return;
    }

    // S — таймер спикера (25 сек)
    if (e.code === 'KeyS' && store.screen === 'board') {
      e.preventDefault();
      actions.onToggleSpeakerTimer();
      return;
    }

    // H — Шторка подсказок ведущего
    if (e.code === 'KeyH') {
      e.preventDefault();
      actions.onToggleGmDrawer();
      return;
    }

    // R — Справочник правил
    if (e.code === 'KeyR') {
      e.preventDefault();
      if (store.ui.modal?.type === 'rules') {
        actions.onCloseModal();
      } else {
        actions.onOpenRules('rules');
      }
      return;
    }

    // M — Звук (Mute)
    if (e.code === 'KeyM') {
      e.preventDefault();
      actions.onToggleSound();
      return;
    }

    // F — Полноэкранный режим
    if (e.code === 'KeyF') {
      e.preventDefault();
      actions.onToggleFullscreen();
    }
  });
}

/* ============================================================================
   Атмосферный фоновый canvas (мягкие линии медиапотоков и «искры»)
   ============================================================================ */

function initAmbientCanvas() {
  const canvas = document.getElementById('ambient-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let rafId = null;

  const sparks = Array.from({ length: 34 }, (_, i) => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.00025,
    vy: -0.00018 - Math.random() * 0.00028,
    r: 1.4 + Math.random() * 2.2,
    tone: i % 3 === 0 ? '#EF4444' : i % 3 === 1 ? '#F59E0B' : '#06B6D4'
  }));

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const drawFrame = () => {
    ctx.clearRect(0, 0, width, height);
    const isLight = store.prefs.theme === 'light';
    const lineAlpha = isLight ? 0.08 : 0.11;

    // Тонкие соединительные линии медиасети
    for (let i = 0; i < sparks.length; i++) {
      const a = sparks[i];
      const ax = a.x * width;
      const ay = a.y * height;

      for (let j = i + 1; j < sparks.length; j++) {
        const b = sparks[j];
        const dx = ax - b.x * width;
        const dy = ay - b.y * height;
        const dist = Math.hypot(dx, dy);
        if (dist < 170) {
          ctx.strokeStyle = isLight
            ? `rgba(15, 23, 42, ${lineAlpha * (1 - dist / 170)})`
            : `rgba(148, 163, 184, ${lineAlpha * (1 - dist / 170)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }
      }
    }

    // Сами «искры»
    for (const s of sparks) {
      if (!prefersReduced) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.y < -0.03) {
          s.y = 1.03;
          s.x = Math.random();
        }
        if (s.x < -0.03) s.x = 1.03;
        if (s.x > 1.03) s.x = -0.03;
      }

      ctx.globalAlpha = isLight ? 0.45 : 0.65;
      ctx.fillStyle = s.tone;
      ctx.beginPath();
      ctx.arc(s.x * width, s.y * height, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (!prefersReduced && !document.hidden) {
      rafId = window.requestAnimationFrame(drawFrame);
    }
  };

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !prefersReduced && rafId === null) {
      rafId = window.requestAnimationFrame(drawFrame);
    } else if (document.hidden && rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  drawFrame();
}

/* ============================================================================
   Защита от «белого экрана» при непредвиденных ошибках
   ============================================================================ */

function initErrorGuard() {
  const fallbackEl = document.getElementById('error-fallback');
  const msgEl = document.getElementById('error-fallback-message');
  const reloadBtn = document.getElementById('error-reload-btn');
  const resetBtn = document.getElementById('error-reset-btn');

  const showFallback = (errText) => {
    if (!fallbackEl) return;
    if (msgEl && errText) {
      msgEl.textContent = `Техническая деталь: ${errText}. Автосохранение партии в браузере защищено.`;
    }
    fallbackEl.hidden = false;
  };

  window.addEventListener('error', (event) => {
    console.error('[Медиапожарный] Глобальная ошибка:', event.error || event.message);
    showFallback(event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Медиапожарный] Необработанное обещание:', event.reason);
  });

  reloadBtn?.addEventListener('click', () => {
    window.location.reload();
  });

  resetBtn?.addEventListener('click', () => {
    store.clearSavedGame();
    window.location.reload();
  });
}

/* ============================================================================
   Инициализация приложения «Медиапожарный»
   ============================================================================ */

async function bootstrap() {
  initErrorGuard();

  // Подключаем движок к звуку, уведомлениям и автонастройке таймера фаз
  setEngineHooks({
    onToast: (cfg) => showToast(cfg),
    onSound: (name) => sound.play(name),
    onPhaseChanged: (phase) => {
      const autoStart =
        store.prefs.timerMode !== 'free' &&
        (phase === 'phase2_discuss' || phase === 'phase2_dilemma');
      timer.configureForPhase(phase, autoStart);
    }
  });

  timer.setOnComplete((kind, label) => {
    showToast({
      variant: kind === 'speaker' ? 'brand' : 'danger',
      title: kind === 'speaker' ? '⏱️ Время спикера вышло!' : `⏱️ Завершён таймер: ${label}`,
      body:
        kind === 'speaker'
          ? 'Передайте слово следующему столу по «Эстафете голоса».'
          : 'Ведущий может переходить к следующему этапу раунда.'
    });
  });

  // Загружаем локальные примерки изображений из IndexedDB (если были добавлены)
  await initMediaOverrides();

  // Подписываемся на обновления централизованного хранилища
  store.subscribe(renderApp);

  // Первичный рендер
  renderApp(store, 'init');

  // Запускаем горячие клавиши и атмосферный фон
  initHotkeys();
  initAmbientCanvas();

  // Короткий интерактивный онбординг при самом первом открытии (можно пропустить)
  if (!store.isAudienceWindow && !store.prefs.onboardingDone) {
    window.setTimeout(() => {
      if (!store.ui.modal && store.screen === 'hub') {
        store.openModal('onboarding', {});
      }
    }, 450);
  }
}

bootstrap();
