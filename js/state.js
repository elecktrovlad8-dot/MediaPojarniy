/**
 * МЕДИАПОЖАРНЫЙ — Централизованное состояние, localStorage, Undo (25 шагов) и BroadcastChannel
 */

import { getEpisodeById } from '../data/episodes/index.js';

const STORAGE_GAME_KEY = 'mediapozharny_active_game_v1';
const STORAGE_PREFS_KEY = 'mediapozharny_prefs_v1';
const CHANNEL_NAME = 'mediapozharny_sync_v1';
const MAX_UNDO_STACK = 25;

/** Безопасное глубокое клонирование */
export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fallback на JSON при несериализуемых полях
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/** Настройки по умолчанию */
const DEFAULT_PREFS = {
  theme: 'dark',                // 'dark' | 'light'
  soundEnabled: true,
  soundVolume: 0.65,
  timerMode: 'standard',        // 'standard' | 'extended' | 'free'
  hidePhenomena: true,          // Скрывать названия искажений на вбросах до ответа Стола № 5
  onboardingDone: false,
  editMode: false               // Режим ручной правки локаций (± жетон, ± щит)
};

/**
 * Создаёт чистое стартовое состояние партии по конфигурации эпизода.
 */
export function createFreshGameState(episode, setupOptions = {}) {
  const init = episode.initialState;
  const locations = {};
  for (const loc of episode.locations) {
    locations[loc.id] = {
      tokens: loc.startTokens,
      shielded: false,
      lastPulse: null // 'explosion' | 'silence' | 'shield' | 'clear' | null
    };
  }

  const departments = {};
  for (const dept of episode.departments) {
    const custom = setupOptions.customDeptNames?.[dept.id] || '';
    departments[dept.id] = {
      ap: init.apPerDepartment,
      maxAp: init.apPerDepartment,
      customName: custom.trim(),
      spokeThisRound: false,
      speakersByRound: { 1: '', 2: '', 3: '', 4: '' },
      usedOnceActions: []
    };
  }

  const nowIso = new Date().toISOString();

  return {
    sessionId: `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    episodeId: episode.id,
    startedAt: nowIso,
    finishedAt: null,
    outcome: null, // null | 'full_win' | 'pyrrhic_win' | 'lose_trust' | 'lose_deadline'
    round: 1,
    phase: 'phase1', // 'phase1' | 'phase2_discuss' | 'phase2_dilemma' | 'phase2_speeches' | 'phase3' | 'finished'
    trust: init.trust,
    maxTrust: init.maxTrust,
    trustHistory: [
      {
        label: 'Старт',
        round: 0,
        trust: init.trust,
        reason: 'Начальный уровень доверия факультета'
      }
    ],
    locations,
    departments,
    activeSpeakerIndex: 0,
    rumors: {
      revealedIds: [],
      appliedIds: [],
      revealedPhenomenaIds: []
    },
    clues: {
      openedIds: [],
      trueIds: [],
      falseIds: []
    },
    draftPrepared: false,
    refutationPublished: false,
    dilemmaResolved: {},
    phase3State: {
      active: false,
      completed: false,
      stepIndex: -1,
      results: []
    },
    stats: {
      explosions: 0,
      silenceTriggers: 0,
      shieldsPlaced: 0,
      tokensRemoved: 0,
      biasesAnalyzed: 0,
      synergiesTriggered: []
    },
    log: [
      {
        id: `log_${Date.now()}`,
        time: formatClockNow(),
        round: 1,
        phase: 'Старт',
        type: 'system',
        title: `Партия «${episode.title}» запущена`,
        detail: `Стартовое Доверие: ${init.trust}/${init.maxTrust}. На карте 6 «Искр слуха». Дедлайн агентства: ${episode.meta.deadline || '18:00'}.`
      }
    ]
  };
}

export function formatClockNow() {
  const d = new Date();
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

class Store {
  constructor() {
    this.isAudienceWindow = new URLSearchParams(window.location.search).get('view') === 'audience';

    this.prefs = this._loadPrefs();
    this.screen = this.isAudienceWindow ? 'audience' : 'hub'; // 'hub' | 'setup' | 'story' | 'board' | 'debrief' | 'audience'
    this.selectedEpisodeId = 'part1-virus-sluha';
    this.storySlideIndex = 0;

    /** Незавершённая или активная партия */
    this.game = this._loadSavedGame();
    if (this.game && this.game.episodeId) {
      this.selectedEpisodeId = this.game.episodeId;
    }

    /** Стек отмены действий (только для ведущего) */
    this.undoStack = [];

    /** UI-флаги, не требующие сохранения в Undo */
    this.ui = {
      gmDrawerOpen: false,
      modal: null,            // { type, payload }
      audienceConnected: false,
      trustAnim: null,        // 'up' | 'down' | null
      refutationAnim: false,
      timerSnapshot: {
        mainRemaining: 30,
        mainTotal: 30,
        mainRunning: false,
        mainLabel: 'Фаза 1 • Новая волна',
        speakerRemaining: 25,
        speakerTotal: 25,
        speakerRunning: false
      }
    };

    /** Специальный объект того, что сейчас проецируется на 2-й экран аудитории */
    this.audienceSpotlight = null; // { type: 'rumor' | 'clue' | 'dilemma' | 'phase3' | 'refutation', payload }

    /** Подписчики на обновление состояния */
    this._listeners = new Set();

    /** Канал синхронизации со 2-м экраном (BroadcastChannel API) */
    this.channel = null;
    this._initBroadcastChannel();
  }

  /* ------------------------------------------------------------------------
     Подписки и уведомления UI
     ------------------------------------------------------------------------ */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  notify(options = {}) {
    const { save = false, broadcast = true, reason = 'update' } = options;

    if (save && !this.isAudienceWindow) {
      this._saveGame();
    }

    if (broadcast && !this.isAudienceWindow) {
      this.broadcastState(reason);
    }

    for (const fn of this._listeners) {
      try {
        fn(this, reason);
      } catch (err) {
        console.error('[Store] Ошибка в подписчике UI:', err);
      }
    }
  }

  /* ------------------------------------------------------------------------
     Чтение / запись в localStorage
     ------------------------------------------------------------------------ */
  _loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_PREFS_KEY);
      if (!raw) return { ...DEFAULT_PREFS };
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  savePrefs(partial = {}) {
    this.prefs = { ...this.prefs, ...partial };
    try {
      localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(this.prefs));
    } catch (err) {
      console.warn('[Store] Не удалось сохранить настройки:', err);
    }
    document.documentElement.setAttribute('data-theme', this.prefs.theme);
    this.notify({ save: false, broadcast: true, reason: 'prefs' });
  }

  _loadSavedGame() {
    try {
      const raw = localStorage.getItem(STORAGE_GAME_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.episodeId || !parsed.locations) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  _saveGame() {
    if (this.isAudienceWindow) return;
    try {
      if (this.game) {
        localStorage.setItem(STORAGE_GAME_KEY, JSON.stringify(this.game));
      } else {
        localStorage.removeItem(STORAGE_GAME_KEY);
      }
    } catch (err) {
      console.warn('[Store] Не удалось автосохранить партию:', err);
    }
  }

  hasSavedActiveGame(episodeId = null) {
    if (!this.game) return false;
    if (episodeId && this.game.episodeId !== episodeId) return false;
    return !this.game.outcome;
  }

  clearSavedGame() {
    this.game = null;
    this.undoStack = [];
    this.audienceSpotlight = null;
    try {
      localStorage.removeItem(STORAGE_GAME_KEY);
    } catch {
      // ignore
    }
    this.notify({ save: false, broadcast: true, reason: 'reset' });
  }

  /* ------------------------------------------------------------------------
     Получение текущего эпизода
     ------------------------------------------------------------------------ */
  getEpisode() {
    const id = this.game?.episodeId || this.selectedEpisodeId;
    return getEpisodeById(id);
  }

  /* ------------------------------------------------------------------------
     Стек отмены Undo (25 последних шагов)
     ------------------------------------------------------------------------ */
  pushUndo(label = 'Действие') {
    if (!this.game || this.isAudienceWindow) return;
    this.undoStack.push({
      label,
      snapshot: deepClone(this.game)
    });
    if (this.undoStack.length > MAX_UNDO_STACK) {
      this.undoStack.shift();
    }
  }

  canUndo() {
    return this.undoStack.length > 0 && !this.isAudienceWindow;
  }

  undo() {
    if (!this.canUndo()) return null;
    const item = this.undoStack.pop();
    this.game = item.snapshot;
    this.audienceSpotlight = null;
    this.ui.modal = null;
    if (this.screen === 'debrief' && !this.game.outcome) {
      this.screen = 'board';
    }
    this.notify({ save: true, broadcast: true, reason: 'undo' });
    return item.label;
  }

  /* ------------------------------------------------------------------------
     Навигация и управление партией
     ------------------------------------------------------------------------ */
  setScreen(screenName) {
    if (this.isAudienceWindow) return;
    this.screen = screenName;
    if (screenName !== 'board') {
      this.ui.gmDrawerOpen = false;
    }
    if (screenName !== 'story') {
      this.audienceSpotlight = null;
    }
    this.notify({ save: false, broadcast: true, reason: 'screen' });
  }

  selectEpisode(episodeId) {
    this.selectedEpisodeId = episodeId;
    this.notify({ save: false, broadcast: false, reason: 'select_episode' });
  }

  startNewGame(episodeId, setupOptions = {}, goToStory = true) {
    const ep = getEpisodeById(episodeId);
    this.selectedEpisodeId = ep.id;
    this.game = createFreshGameState(ep, setupOptions);
    this.undoStack = [];
    this.storySlideIndex = 0;
    this.audienceSpotlight = null;
    this.ui.modal = null;
    this.screen = goToStory ? 'story' : 'board';
    this.notify({ save: true, broadcast: true, reason: 'new_game' });
  }

  continueSavedGame() {
    if (!this.game) return;
    this.selectedEpisodeId = this.game.episodeId;
    this.screen = this.game.outcome ? 'debrief' : 'board';
    this.notify({ save: false, broadcast: true, reason: 'continue_game' });
  }

  setStorySlide(index) {
    const ep = this.getEpisode();
    const max = Math.max(0, (ep.storySlides?.length || 1) - 1);
    this.storySlideIndex = Math.max(0, Math.min(max, index));
    this.notify({ save: false, broadcast: true, reason: 'story_slide' });
  }

  /* ------------------------------------------------------------------------
     Управление UI-слоями (модалка, шторка, 2-й экран spotlight)
     ------------------------------------------------------------------------ */
  openModal(type, payload = {}) {
    this.ui.modal = { type, payload };
    this.notify({ save: false, broadcast: true, reason: 'modal_open' });
  }

  closeModal() {
    this.ui.modal = null;
    this.audienceSpotlight = null;
    this.notify({ save: false, broadcast: true, reason: 'modal_close' });
  }

  setAudienceSpotlight(spotlight) {
    this.audienceSpotlight = spotlight;
    this.notify({ save: false, broadcast: true, reason: 'spotlight' });
  }

  toggleGmDrawer(forceState = null) {
    this.ui.gmDrawerOpen = forceState === null ? !this.ui.gmDrawerOpen : Boolean(forceState);
    this.notify({ save: false, broadcast: false, reason: 'gm_drawer' });
  }

  updateTimerSnapshot(snapshot) {
    this.ui.timerSnapshot = { ...this.ui.timerSnapshot, ...snapshot };
    // Отправляем тик таймера на 2-й экран отдельно, без перерисовки всего DOM
    if (!this.isAudienceWindow && this.channel) {
      try {
        this.channel.postMessage({
          type: 'TIMER_TICK',
          timer: this.ui.timerSnapshot
        });
      } catch {
        // ignore
      }
    }
  }

  triggerTrustAnim(direction) {
    this.ui.trustAnim = direction;
    setTimeout(() => {
      if (this.ui.trustAnim === direction) {
        this.ui.trustAnim = null;
      }
    }, 700);
  }

  addLogEntry({ type = 'info', title, detail = '' }) {
    if (!this.game) return;
    const phaseLabels = {
      phase1: 'Фаза 1',
      phase2_discuss: 'Фаза 2 (Обсуждение)',
      phase2_dilemma: 'Дилемма № 6',
      phase2_speeches: 'Фаза 2 (Спикеры)',
      phase3: 'Фаза 3',
      finished: 'Финал'
    };
    this.game.log.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      time: formatClockNow(),
      round: this.game.round,
      phase: phaseLabels[this.game.phase] || 'Штаб',
      type,
      title,
      detail
    });
  }

  /* ------------------------------------------------------------------------
     BroadcastChannel API — синхронизация 2-го экрана аудитории
     ------------------------------------------------------------------------ */
  _initBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        if (!this.isAudienceWindow) {
          // Ведущий получает приветствие от открытого окна проектора
          if (msg.type === 'AUDIENCE_HELLO') {
            this.ui.audienceConnected = true;
            this.broadcastState('audience_handshake');
            this.notify({ save: false, broadcast: false, reason: 'audience_connected' });
          } else if (msg.type === 'AUDIENCE_BYE') {
            this.ui.audienceConnected = false;
            this.notify({ save: false, broadcast: false, reason: 'audience_disconnected' });
          }
        } else {
          // Окно проектора (2-й экран) принимает обновления от ведущего
          if (msg.type === 'STATE_SYNC') {
            this.applyAudienceSync(msg.payload);
          } else if (msg.type === 'TIMER_TICK') {
            this.ui.timerSnapshot = msg.timer;
            for (const fn of this._listeners) {
              fn(this, 'timer_tick');
            }
          }
        }
      };

      if (this.isAudienceWindow) {
        this.channel.postMessage({ type: 'AUDIENCE_HELLO' });
        window.addEventListener('beforeunload', () => {
          try {
            this.channel?.postMessage({ type: 'AUDIENCE_BYE' });
          } catch {
            // ignore
          }
        });
      }
    } catch (err) {
      console.warn('[Store] BroadcastChannel недоступен:', err);
    }
  }

  /**
   * Формирует безопасный пакет данных БЕЗ спойлеров и отправляет на 2-й экран проектора.
   */
  broadcastState(reason = 'sync') {
    if (this.isAudienceWindow || !this.channel) return;
    try {
      const payload = {
        reason,
        hostScreen: this.screen,
        selectedEpisodeId: this.selectedEpisodeId,
        storySlideIndex: this.storySlideIndex,
        theme: this.prefs.theme,
        hidePhenomena: this.prefs.hidePhenomena,
        timerSnapshot: this.ui.timerSnapshot,
        spotlight: this.audienceSpotlight,
        game: this.game ? deepClone(this.game) : null
      };
      this.channel.postMessage({ type: 'STATE_SYNC', payload });
    } catch (err) {
      console.warn('[Store] Ошибка синхронизации со 2-м экраном:', err);
    }
  }

  applyAudienceSync(payload) {
    if (!payload) return;
    this.selectedEpisodeId = payload.selectedEpisodeId || this.selectedEpisodeId;
    this.storySlideIndex = payload.storySlideIndex || 0;
    this.hostScreen = payload.hostScreen || 'hub';
    this.prefs.theme = payload.theme || 'dark';
    this.prefs.hidePhenomena = Boolean(payload.hidePhenomena);
    this.ui.timerSnapshot = payload.timerSnapshot || this.ui.timerSnapshot;
    this.audienceSpotlight = payload.spotlight || null;
    this.game = payload.game || null;

    document.documentElement.setAttribute('data-theme', this.prefs.theme);

    for (const fn of this._listeners) {
      try {
        fn(this, 'audience_sync');
      } catch (err) {
        console.error('[Store] Ошибка обновления 2-го экрана:', err);
      }
    }
  }

  /** Открывает синхронизированное 2-е окно для проектора */
  openAudienceWindow() {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'audience');
    const win = window.open(
      url.toString(),
      'mediapozharny_audience_window',
      'width=1280,height=780,menubar=no,toolbar=no,location=no,status=no'
    );
    if (!win) {
      return false;
    }
    this.ui.audienceConnected = true;
    setTimeout(() => this.broadcastState('window_open'), 600);
    return true;
  }
}

export const store = new Store();
