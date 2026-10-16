const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
export const defaultSettings = Object.freeze({
  quality: 'high', music: .35, sfx: .65, muted: false, motion: !reduceMotion,
  brightness: 1, controlSize: 'normal', controlSide: 'left', cameraSensitivity: 1,
  tapToMove: true, showTouchControls: false
});

const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
export function normalizeSettings(input = {}) {
  const result = { ...defaultSettings };
  if (!input || typeof input !== 'object') return result;
  for (const [key, allowed] of Object.entries({ quality: ['low','medium','high'], controlSize: ['normal','large'], controlSide: ['left','right'] })) {
    if (allowed.includes(input[key])) result[key] = input[key];
  }
  for (const key of ['muted','motion','tapToMove','showTouchControls']) if (typeof input[key] === 'boolean') result[key] = input[key];
  for (const [key,min,max] of [['music',0,1],['sfx',0,1],['brightness',.7,1.35],['cameraSensitivity',.5,1.8]]) {
    if (input[key] !== undefined) result[key] = bounded(input[key],min,max,result[key]);
  }
  return result;
}
