// src/plugin/extra-codecs/index.js
import jsjiamiV7Rc4 from './jsjiami_v7_rc4.js';
import base64 from './base64.js'; // 可选；没有也能正常运行

function apply(fn, code, notes) {
  if (!fn) return code;
  try {
    const next = fn(code, { notes });
    return (typeof next === 'string' && next) ? next : code;
  } catch (e) {
    notes?.push?.(`[extra-codecs] ${fn.name || 'anon'} failed: ${e.message}`);
    return code;
  }
}

// 单轮
export function runExtraCodecs(code, { notes } = {}) {
  let out = code;
  // 先尝试简单的 base64（可选），再跑 rc4
  out = apply(base64?.decode || base64, out, notes);
  out = apply(jsjiamiV7Rc4?.decode || jsjiamiV7Rc4, out, notes);
  return out;
}

// 多轮直到稳定
export function runExtraCodecsLoop(code, { notes } = {}, { maxPasses = 3 } = {}) {
  let out = code;
  for (let i = 1; i <= maxPasses; i++) {
    const next = runExtraCodecs(out, { notes });
    if (next === out) {
      notes?.push?.(`extra-codecs: converged at pass ${i - 1 || 0}`);
      return out;
    }
    out = next;
    notes?.push?.(`extra-codecs: pass ${i} changed`);
  }
  notes?.push?.(`extra-codecs: reached max passes ${maxPasses}`);
  return out;
}

export default runExtraCodecs;