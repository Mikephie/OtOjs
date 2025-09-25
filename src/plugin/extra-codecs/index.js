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
      notes?.push?.(`[extra-codecs] ${fn.name || 'codec'} failed: ${e.message}`);
    }
  }
  return out;
}

export default runExtraCodecs;