/**
 * МЕДИАПОЖАРНЫЙ — Реестр частей (антологии) сценариев
 *
 * Чтобы добавить новую часть в будущем:
 * 1. Создайте файл сценария ./part2-<slug>.js по образцу part1-virus-sluha.js
 * 2. Добавьте папку с изображениями ./assets/images/episodes/part2/
 * 3. Импортируйте объект сценария ниже и замените слот-заглушку в массиве EPISODES.
 */

import { part1VirusSluha } from './part1-virus-sluha.js';

export const EPISODES = [
  part1VirusSluha,

  {
    id: 'part2-deepfake-storm',
    number: 2,
    status: 'in_development',
    statusLabel: 'В разработке',
    title: 'Эффект дипфейка',
    subtitle: 'Кризис в прямом эфире',
    tagline: 'Синтетический голос, верификация видео и давление федеральных пабликов',
    description:
      'За два часа до отчётного форума в сети появляется дипфейк-запись с голосом ректора. Штабу предстоит проверить метаданные, остановить лавину репостов и выстроить антикризисную пресс-конференцию.',
    meta: {
      audience: 'Студенты 18+',
      players: '25–30 участников (5 столов) + ведущий',
      duration: '45–50 минут',
      rounds: 4,
      format: 'Очная настольная игра + экран ведущего'
    },
    assetsBase: './assets/images/episodes/part2/',
    moduleHint: 'data/episodes/part2-*.js'
  },

  {
    id: 'part3-algorithmic-echo',
    number: 3,
    status: 'coming_soon',
    statusLabel: 'Скоро',
    title: 'Эхо-камера',
    subtitle: 'Война алгоритмов и микроинфлюенсеров',
    tagline: 'Поляризация аудитории, скрытая реклама и медиация конфликтующих сообществ',
    description:
      'Два студенческих медиаблока вступают в публичный конфликт вокруг благотворительного фестиваля. Как вывести аудиторию из эхо-камеры, когда алгоритмы соцсетей намеренно усиливают возмущение?',
    meta: {
      audience: 'Студенты 18+',
      players: '25–30 участников (5 столов) + ведущий',
      duration: '45–50 минут',
      rounds: 4,
      format: 'Очная настольная игра + экран ведущего'
    },
    assetsBase: './assets/images/episodes/part3/',
    moduleHint: 'data/episodes/part3-*.js'
  }
];

/**
 * Возвращает список всех эпизодов антологии (доступных и будущих).
 */
export function getAllEpisodes() {
  return EPISODES;
}

/**
 * Возвращает только полностью доступные (играбельные) части.
 */
export function getAvailableEpisodes() {
  return EPISODES.filter((ep) => ep.status === 'available');
}

/**
 * Находит часть по идентификатору. Если не найдена — возвращает первую доступную.
 */
export function getEpisodeById(episodeId) {
  return (
    EPISODES.find((ep) => ep.id === episodeId) ||
    getAvailableEpisodes()[0] ||
    EPISODES[0]
  );
}
