/**
 * МЕДИАПОЖАРНЫЙ — Контроллер основного таймера фазы и мини-таймера спикера (25 / 40 сек)
 *
 * Особенности:
 * - Работает по реальному времени (Date.now), не «уплывает» при сворачивании вкладки.
 * - Обновляет цифры таймеров в DOM точечно (без перерисовки всего экрана каждую секунду).
 * - Автоматически синхронизирует тики со 2-м экраном аудитории через store.updateTimerSnapshot().
 * - Озвучивает последние 10 секунд тиканьем и даёт гонг по завершении отсчёта.
 */

import { store } from './state.js';
import { sound } from './sound.js';

export function formatMMSS(totalSeconds) {
  const safe = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatSS(totalSeconds) {
  const safe = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
  return `${String(safe).padStart(2, '0')}с`;
}

const PHASE_LABELS = {
  phase1: 'Фаза 1 • Новая волна',
  phase2_discuss: 'Фаза 2 • Совещание столов',
  phase2_dilemma: 'Особый шаг • Дилемма № 6',
  phase2_speeches: 'Фаза 2 • Выход спикеров',
  phase3: 'Фаза 3 • Проверка поля',
  finished: 'Партия завершена'
};

class TimerController {
  constructor() {
    this.mainTotal = 30;
    this.mainRemaining = 30;
    this.mainRunning = false;
    this.mainLabel = PHASE_LABELS.phase1;
    this._mainLastTickMs = 0;
    this._mainLastWholeSec = 30;

    this.speakerTotal = 25;
    this.speakerRemaining = 25;
    this.speakerRunning = false;
    this._speakerLastTickMs = 0;
    this._speakerLastWholeSec = 25;

    this._intervalId = null;
    this._onCompleteCallback = null;
  }

  /** Регистрация обработчика окончания таймера (для тоста в app.js) */
  setOnComplete(fn) {
    this._onCompleteCallback = fn;
  }

  /** Возвращает активный пресет длительностей из конфигурации текущего эпизода */
  getTimingPreset() {
    const ep = store.getEpisode();
    const mode = store.prefs.timerMode || 'standard';
    return (
      ep?.timings?.[mode] ||
      ep?.timings?.standard || {
        phase1Sec: 30,
        discussSec: 120,
        dilemmaSec: 15,
        speechesSec: 120,
        phase3Sec: 30,
        speakerSec: 25,
        refutationSpeakerSec: 40
      }
    );
  }

  getPhaseDuration(phase) {
    const preset = this.getTimingPreset();
    switch (phase) {
      case 'phase1':
        return preset.phase1Sec;
      case 'phase2_discuss':
        return preset.discussSec;
      case 'phase2_dilemma':
        return preset.dilemmaSec;
      case 'phase2_speeches':
        return preset.speechesSec;
      case 'phase3':
        return preset.phase3Sec;
      default:
        return 0;
    }
  }

  getSpeakerDefaultSec(isRefutation = false) {
    const preset = this.getTimingPreset();
    return isRefutation ? preset.refutationSpeakerSec || 40 : preset.speakerSec || 25;
  }

  /* ==========================================================================
     Управление основным таймером фазы
     ========================================================================== */

  configureForPhase(phase, autoStart = false) {
    const sec = this.getPhaseDuration(phase);
    this.mainTotal = sec;
    this.mainRemaining = sec;
    this._mainLastWholeSec = sec;
    this.mainLabel = PHASE_LABELS[phase] || 'Таймер штаба';
    this.mainRunning = false;

    // При смене фазы сбрасываем мини-таймер спикера к базовому значению
    const defaultSpeaker = this.getSpeakerDefaultSec(false);
    this.speakerTotal = defaultSpeaker;
    this.speakerRemaining = defaultSpeaker;
    this._speakerLastWholeSec = defaultSpeaker;
    this.speakerRunning = false;

    if (autoStart && sec > 0) {
      this.startMain();
    } else {
      this._syncAndPaint();
    }
  }

  startMain() {
    if (this.mainRemaining <= 0) {
      this.mainRemaining = this.mainTotal > 0 ? this.mainTotal : 30;
    }
    this.mainRunning = true;
    this._mainLastTickMs = Date.now();
    this._mainLastWholeSec = Math.ceil(this.mainRemaining);
    this._ensureLoop();
    this._syncAndPaint();
  }

  pauseMain() {
    if (!this.mainRunning) return;
    this.mainRunning = false;
    this._maybeStopLoop();
    this._syncAndPaint();
  }

  toggleMain() {
    if (this.mainRunning) {
      this.pauseMain();
    } else {
      this.startMain();
    }
    sound.play('click');
    return this.mainRunning;
  }

  resetMain() {
    this.mainRunning = false;
    this.mainRemaining = this.mainTotal;
    this._mainLastWholeSec = Math.ceil(this.mainRemaining);
    this._maybeStopLoop();
    sound.play('click');
    this._syncAndPaint();
  }

  addMainSeconds(deltaSec = 30) {
    this.mainRemaining = Math.max(0, this.mainRemaining + deltaSec);
    if (this.mainRemaining > this.mainTotal) {
      this.mainTotal = Math.ceil(this.mainRemaining);
    }
    this._mainLastWholeSec = Math.ceil(this.mainRemaining);
    sound.play('click');
    this._syncAndPaint();
  }

  /* ==========================================================================
     Управление мини-таймером дежурного спикера (25 сек / 40 сек)
     ========================================================================== */

  startSpeaker(customSeconds = null) {
    const sec =
      typeof customSeconds === 'number' && customSeconds > 0
        ? customSeconds
        : this.getSpeakerDefaultSec(false);

    this.speakerTotal = sec;
    this.speakerRemaining = sec;
    this._speakerLastWholeSec = sec;
    this.speakerRunning = true;
    this._speakerLastTickMs = Date.now();
    this._ensureLoop();
    sound.play('click');
    this._syncAndPaint();
  }

  toggleSpeaker(customSeconds = null) {
    if (this.speakerRunning) {
      this.speakerRunning = false;
      this._maybeStopLoop();
      sound.play('click');
      this._syncAndPaint();
      return false;
    }

    if (this.speakerRemaining <= 0 || typeof customSeconds === 'number') {
      this.startSpeaker(customSeconds);
      return true;
    }

    this.speakerRunning = true;
    this._speakerLastTickMs = Date.now();
    this._speakerLastWholeSec = Math.ceil(this.speakerRemaining);
    this._ensureLoop();
    sound.play('click');
    this._syncAndPaint();
    return true;
  }

  resetSpeaker(customSeconds = null) {
    const sec =
      typeof customSeconds === 'number' && customSeconds > 0
        ? customSeconds
        : this.speakerTotal || this.getSpeakerDefaultSec(false);
    this.speakerRunning = false;
    this.speakerTotal = sec;
    this.speakerRemaining = sec;
    this._speakerLastWholeSec = sec;
    this._maybeStopLoop();
    this._syncAndPaint();
  }

  stopAll() {
    this.mainRunning = false;
    this.speakerRunning = false;
    this._maybeStopLoop();
    this._syncAndPaint();
  }

  /* ==========================================================================
     Внутренний цикл отсчёта и точечное обновление DOM
     ========================================================================== */

  _ensureLoop() {
    if (this._intervalId !== null) return;
    this._intervalId = window.setInterval(() => this._tick(), 200);
  }

  _maybeStopLoop() {
    if (!this.mainRunning && !this.speakerRunning && this._intervalId !== null) {
      window.clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  _tick() {
    const now = Date.now();
    let changed = false;

    // 1. Основной таймер
    if (this.mainRunning) {
      const dt = (now - this._mainLastTickMs) / 1000;
      this._mainLastTickMs = now;
      this.mainRemaining = Math.max(0, this.mainRemaining - dt);

      const whole = Math.ceil(this.mainRemaining);
      if (whole !== this._mainLastWholeSec) {
        this._mainLastWholeSec = whole;
        changed = true;

        if (whole > 0 && whole <= 10) {
          sound.play('tick');
        } else if (whole === 0) {
          this.mainRunning = false;
          sound.play('gong');
          if (this._onCompleteCallback) {
            this._onCompleteCallback('main', this.mainLabel);
          }
        }
      }
    }

    // 2. Таймер спикера
    if (this.speakerRunning) {
      const dt = (now - this._speakerLastTickMs) / 1000;
      this._speakerLastTickMs = now;
      this.speakerRemaining = Math.max(0, this.speakerRemaining - dt);

      const whole = Math.ceil(this.speakerRemaining);
      if (whole !== this._speakerLastWholeSec) {
        this._speakerLastWholeSec = whole;
        changed = true;

        if (whole > 0 && whole <= 5) {
          sound.play('tick');
        } else if (whole === 0) {
          this.speakerRunning = false;
          sound.play('gong');
          if (this._onCompleteCallback) {
            this._onCompleteCallback('speaker', 'Время спикера истекло');
          }
        }
      }
    }

    if (changed) {
      this._syncAndPaint();
    }
    this._maybeStopLoop();
  }

  getSnapshot() {
    return {
      mainRemaining: Math.ceil(this.mainRemaining),
      mainTotal: Math.ceil(this.mainTotal),
      mainRunning: this.mainRunning,
      mainLabel: this.mainLabel,
      speakerRemaining: Math.ceil(this.speakerRemaining),
      speakerTotal: Math.ceil(this.speakerTotal),
      speakerRunning: this.speakerRunning
    };
  }

  _syncAndPaint() {
    const snap = this.getSnapshot();
    store.updateTimerSnapshot(snap);
    this.paintDom(snap);
  }

  /**
   * Точечно обновляет все элементы таймеров на текущем экране (ведущего или 2-го экрана аудитории).
   */
  paintDom(snap = store.ui.timerSnapshot) {
    const mainText = formatMMSS(snap.mainRemaining);
    const speakerText = formatSS(snap.speakerRemaining);
    const mainUrgent = snap.mainRemaining > 0 && snap.mainRemaining <= 10 && snap.mainRunning;
    const speakerUrgent = snap.speakerRemaining > 0 && snap.speakerRemaining <= 5 && snap.speakerRunning;

    document.querySelectorAll('[data-timer-main-digits]').forEach((el) => {
      el.textContent = mainText;
    });

    document.querySelectorAll('[data-timer-main-label]').forEach((el) => {
      el.textContent = snap.mainLabel || '';
    });

    document.querySelectorAll('[data-timer-main-box]').forEach((el) => {
      el.classList.toggle('is-running', Boolean(snap.mainRunning));
      el.classList.toggle('is-urgent', mainUrgent);
    });

    document.querySelectorAll('[data-timer-main-toggle-icon]').forEach((el) => {
      el.textContent = snap.mainRunning ? '⏸' : '▶';
    });

    document.querySelectorAll('[data-timer-speaker-digits]').forEach((el) => {
      el.textContent = speakerText;
    });

    document.querySelectorAll('[data-timer-speaker-box]').forEach((el) => {
      el.classList.toggle('is-running', Boolean(snap.speakerRunning));
      el.classList.toggle('is-urgent', speakerUrgent);
    });
  }
}

export const timer = new TimerController();
