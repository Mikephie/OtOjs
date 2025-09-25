// plugins/extra-codecs/index.js
const { jsjiamiV7Rc4 } = require('./jsjiami_v7_rc4');

const STEPS = [
  jsjiamiV7Rc4,       // 先试 jsjiami v7 RC4 + Base64 + 字符串表/旋转
  // ……后面可以继续加新编码
];

async function runExtraCodecs(code, ctx = {}) {
  for (const step of STEPS) {
    try {
      const before = code;
      code = await step(code, ctx);
      if (code !== before) ctx.changed = true;
    } catch (e) {
      ctx.notes?.push?.(`[extra-codecs] ${step.name} failed: ${e.message}`);
    }
  }
  return code;
}

module.exports = { runExtraCodecs };