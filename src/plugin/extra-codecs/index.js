// src/plugin/extra-codecs/index.js
import jsjiamiV7Rc4 from './jsjiami_v7_rc4.js';

export function runExtraCodecs(code, { notes } = {}) {
  let out = code;
  const chain = [jsjiamiV7Rc4];
  for (const fn of chain) {
    try {
      const next = fn(out, { notes });
      if (typeof next === 'string' && next !== out) out = next;
    } catch (e) {
      notes?.push?.(`[extra-codecs] ${fn.name || 'plugin'} failed: ${e.message}`);
    }
  }
  return out;
}

export function runExtraCodecsLoop(code, { notes } = {}, { maxPasses = 2 } = {}) {
  let out = code;
  for (let i = 1; i <= maxPasses; i++) {
    const next = runExtraCodecs(out, { notes });
    if (typeof next !== 'string' || next === out) {
      if (i > 1) notes?.push?.(`extra-codecs: converged at pass ${i - 1}`);
      return out;
    }
    out = next;
    notes?.push?.(`extra-codecs: pass ${i} changed`);
  }
  notes?.push?.(`extra-codecs: reached max passes ${maxPasses}`);
  return out;
}

export default runExtraCodecsLoop;