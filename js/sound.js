/**
 * МЕДИАПОЖАРНЫЙ — Звуковой движок на Web Audio API + опциональные mp3 из ./assets/audio/
 *
 * Работает на 100% без внешних аудиофайлов за счёт встроенного синтезатора.
 * Если положить alert.mp3, timer.mp3, explosion.mp3 или victory.mp3 в ./assets/audio/,
 * движок автоматически подхватит их (с мгновенным откатом на синтезатор при ошибке).
 */

import { store } from './state.js';

const OPTIONAL_MP3_MAP = {
  alert: './assets/audio/alert.mp3',
  gong: './assets/audio/timer.mp3',
  explosion: './assets/audio/explosion.mp3',
  victory: './assets/audio/victory.mp3'
};

class SoundManager {
  constructor() {
    this.ctx = null;
    this.mp3Availability = new Map(); // soundName -> boolean | 'pending'
    this.audioPool = new Map();       // soundName -> HTMLAudioElement
  }

  /** Инициализирует AudioContext после первого пользовательского жеста */
  _ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      this.ctx = new AudioCtx();
      return this.ctx;
    } catch {
      return null;
    }
  }

  isEnabled() {
    return Boolean(store.prefs.soundEnabled) && !store.isAudienceWindow;
  }

  getVolume() {
    const v = Number(store.prefs.soundVolume);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.65;
  }

  setMuted(muted) {
    store.savePrefs({ soundEnabled: !muted });
  }

  toggleMute() {
    const next = !store.prefs.soundEnabled;
    store.savePrefs({ soundEnabled: next });
    if (next) {
      this.play('click');
    }
    return next;
  }

  setVolume(vol) {
    const clamped = Math.max(0, Math.min(1, Number(vol) || 0));
    store.savePrefs({ soundVolume: clamped });
  }

  /**
   * Проигрывает звук по имени. Сначала проверяет опциональный mp3,
   * иначе синтезирует чистый сигнал через Web Audio API.
   */
  play(name) {
    if (!this.isEnabled()) return;
    const vol = this.getVolume();
    if (vol <= 0.01) return;

    if (OPTIONAL_MP3_MAP[name]) {
      const status = this.mp3Availability.get(name);
      if (status === true) {
        this._playMp3(name, vol);
        return;
      }
      if (status === undefined) {
        this._probeAndPlayMp3(name, vol);
        return;
      }
    }

    this._playSynth(name, vol);
  }

  _probeAndPlayMp3(name, vol) {
    this.mp3Availability.set(name, 'pending');
    const url = OPTIONAL_MP3_MAP[name];

    fetch(url, { method: 'HEAD' })
      .then((res) => {
        if (res.ok) {
          this.mp3Availability.set(name, true);
          this._playMp3(name, vol);
        } else {
          this.mp3Availability.set(name, false);
          this._playSynth(name, vol);
        }
      })
      .catch(() => {
        this.mp3Availability.set(name, false);
        this._playSynth(name, vol);
      });
  }

  _playMp3(name, vol) {
    try {
      let audio = this.audioPool.get(name);
      if (!audio) {
        audio = new Audio(OPTIONAL_MP3_MAP[name]);
        this.audioPool.set(name, audio);
      }
      audio.volume = vol;
      audio.currentTime = 0;
      audio.play().catch(() => {
        this._playSynth(name, vol);
      });
    } catch {
      this._playSynth(name, vol);
    }
  }

  /* ==========================================================================
     Синтезатор звуковых эффектов на Web Audio API
     ========================================================================== */

  _tone(ctx, { freq = 440, endFreq = null, type = 'sine', start = 0, duration = 0.16, gain = 0.25 }) {
    const now = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, gain), now + Math.min(0.015, duration * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(g);
    g.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  _noiseBurst(ctx, { start = 0, duration = 0.35, gain = 0.28, filterFreq = 600 }) {
    const now = ctx.currentTime + start;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.38));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration + 0.02);
  }

  _playSynth(name, vol) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const v = vol * 0.45;

    switch (name) {
      case 'click':
        this._tone(ctx, { freq: 640, endFreq: 480, type: 'triangle', duration: 0.055, gain: v * 0.35 });
        break;

      case 'tick':
        // Чёткое тиканье последних 10 секунд таймера
        this._tone(ctx, { freq: 980, endFreq: 760, type: 'square', duration: 0.045, gain: v * 0.24 });
        break;

      case 'gong':
        // Выразительный гонг окончания фазы / спикера
        this._tone(ctx, { freq: 523.25, type: 'sine', start: 0, duration: 0.55, gain: v * 0.75 });
        this._tone(ctx, { freq: 392.0, type: 'triangle', start: 0.12, duration: 0.75, gain: v * 0.65 });
        this._tone(ctx, { freq: 784.0, type: 'sine', start: 0.02, duration: 0.45, gain: v * 0.25 });
        break;

      case 'alert':
        // Тревожный телетайп «BREAKING / НОВЫЙ ВБРОС»
        this._tone(ctx, { freq: 880, type: 'sawtooth', start: 0, duration: 0.11, gain: v * 0.4 });
        this._tone(ctx, { freq: 660, type: 'sawtooth', start: 0.13, duration: 0.11, gain: v * 0.4 });
        this._tone(ctx, { freq: 880, type: 'sawtooth', start: 0.26, duration: 0.18, gain: v * 0.45 });
        break;

      case 'rumor_apply':
        // Глухой нисходящий удар при добавлении искр слуха
        this._tone(ctx, { freq: 240, endFreq: 110, type: 'sawtooth', start: 0, duration: 0.24, gain: v * 0.55 });
        break;

      case 'shield':
        // Кристальный восходящий звук активации «Щита модерации»
        this._tone(ctx, { freq: 440, type: 'triangle', start: 0, duration: 0.15, gain: v * 0.5 });
        this._tone(ctx, { freq: 659.25, type: 'triangle', start: 0.08, duration: 0.22, gain: v * 0.55 });
        this._tone(ctx, { freq: 880, type: 'sine', start: 0.16, duration: 0.32, gain: v * 0.45 });
        break;

      case 'explosion':
        // Драматичный Информационный взрыв (4+ жетонов / Стрейзанд)
        this._noiseBurst(ctx, { start: 0, duration: 0.62, gain: v * 0.95, filterFreq: 900 });
        this._tone(ctx, { freq: 145, endFreq: 38, type: 'sawtooth', start: 0, duration: 0.52, gain: v * 0.85 });
        this._tone(ctx, { freq: 220, endFreq: 65, type: 'square', start: 0.05, duration: 0.35, gain: v * 0.4 });
        break;

      case 'clue_true':
        // Печать «ПОДТВЕРЖДЕНО: В БАЗУ» — уверенный аккорд
        this._tone(ctx, { freq: 523.25, type: 'triangle', start: 0, duration: 0.14, gain: v * 0.55 });
        this._tone(ctx, { freq: 659.25, type: 'triangle', start: 0.1, duration: 0.16, gain: v * 0.55 });
        this._tone(ctx, { freq: 783.99, type: 'sine', start: 0.2, duration: 0.34, gain: v * 0.6 });
        break;

      case 'clue_false':
        // Печать «ОТСЕЯНО: ШУМ» — приглушённый диссонанс
        this._tone(ctx, { freq: 310, endFreq: 220, type: 'sawtooth', start: 0, duration: 0.16, gain: v * 0.45 });
        this._tone(ctx, { freq: 210, endFreq: 165, type: 'triangle', start: 0.14, duration: 0.24, gain: v * 0.45 });
        break;

      case 'action_ok':
        this._tone(ctx, { freq: 520, endFreq: 680, type: 'sine', start: 0, duration: 0.13, gain: v * 0.48 });
        break;

      case 'trust_up':
        this._tone(ctx, { freq: 587.33, type: 'sine', start: 0, duration: 0.14, gain: v * 0.5 });
        this._tone(ctx, { freq: 880, type: 'sine', start: 0.11, duration: 0.28, gain: v * 0.55 });
        break;

      case 'round_next':
        this._tone(ctx, { freq: 392, type: 'triangle', start: 0, duration: 0.15, gain: v * 0.5 });
        this._tone(ctx, { freq: 523.25, type: 'triangle', start: 0.12, duration: 0.28, gain: v * 0.55 });
        break;

      case 'victory':
        // Торжественный финал
        this._tone(ctx, { freq: 523.25, type: 'triangle', start: 0, duration: 0.18, gain: v * 0.65 });
        this._tone(ctx, { freq: 659.25, type: 'triangle', start: 0.14, duration: 0.18, gain: v * 0.65 });
        this._tone(ctx, { freq: 783.99, type: 'triangle', start: 0.28, duration: 0.22, gain: v * 0.7 });
        this._tone(ctx, { freq: 1046.5, type: 'sine', start: 0.44, duration: 0.65, gain: v * 0.75 });
        break;

      case 'defeat':
        // Тревожно-минорный финал поражения
        this._tone(ctx, { freq: 392, type: 'sawtooth', start: 0, duration: 0.26, gain: v * 0.5 });
        this._tone(ctx, { freq: 349.23, type: 'sawtooth', start: 0.24, duration: 0.28, gain: v * 0.5 });
        this._tone(ctx, { freq: 293.66, type: 'sawtooth', start: 0.48, duration: 0.65, gain: v * 0.55 });
        break;

      default:
        this._tone(ctx, { freq: 500, type: 'sine', duration: 0.1, gain: v * 0.35 });
        break;
    }
  }
}

export const sound = new SoundManager();
