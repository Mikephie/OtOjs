// plugin/extra-codecs/index.js
import { jsjiamiV7Rc4 } from './jsjiami_v7_rc4.js';

const STEPS = [
  jsjiamiV7Rc4,     // 往后可继续追加新的编码器
];

export async function runExtraCodecs(code, ctx = {}) {
  let out = code;
  for (const step of STEPS) {
    try {
      const before = out;
      const ret = await step(out, ctx);
      out = typeof ret === 'string' ? ret : (ret?.code ?? before);
    } catch (e) {
      ctx.notes?.push?.(`[extra-codecs] ${step.name} failed: ${e.message}`);
    }
  }
  return out;
}