// src/plugin/extra-codecs/index.js
import jsjiamiV7Rc4 from './jsjiami_v7_rc4.js'; // 注意：下划线命名

/**
 * 单轮执行所有额外编码器（按顺序）
 * @param {string} code
 * @param {{notes?: string[]}} ctx
 * @returns {Promise<string>}
 */
export async function runExtraCodecs(code, ctx = {}) {
  const notes = ctx.notes || [];
  let out = String(code);

  const chain = [
    jsjiamiV7Rc4,          // jsjiami v7 rc4 轻量沙箱替换
    // 未来要加别的 codec 就继续往后塞
  ];

  for (const fn of chain) {
    try {
      const next = await fn(out, { notes });   // 关键：await
      if (typeof next === 'string' && next !== out) out = next;
    } catch (e) {
      notes.push(`[extra-codecs] ${fn.name || 'codec'} failed: ${e?.message || e}`);
    }
  }
  return out;
}

/**
 * 多轮循环直到稳定（默认最多 3 轮）
 * @param {string} code
 * @param {{notes?: string[]}} ctx
 * @param {{maxPasses?: number}} opt
 * @returns {Promise<string>}
 */
export async function runExtraCodecsLoop(code, ctx = {}, opt = {}) {
  const notes = ctx.notes || [];
  const maxPasses = Number(opt.maxPasses ?? 3);

  let out = String(code);
  for (let pass = 1; pass <= maxPasses; pass++) {
    const next = await runExtraCodecs(out, { notes });
    if (typeof next !== 'string' || next === out) {
      if (pass > 1) notes.push(`extra-codecs: converged at pass ${pass - 1}`);
      return out;
    }
    out = next;
    notes.push(`extra-codecs: pass ${pass} changed`);
  }
  notes.push(`extra-codecs: reached max passes ${maxPasses}`);
  return out;
}

export default runExtraCodecs;