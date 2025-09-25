// src/plugin/extra-codecs/jsjiami_v7_rc4.js
import vm from 'vm';

// 安全的 atob/btoa polyfill
function atobPoly(b64) {
  return Buffer.from(b64, 'base64').toString('binary');
}

export default function jsjiamiV7Rc4(code, { notes } = {}) {
  if (typeof code !== 'string') return code;

  // 粗检测：是否存在典型构型
  const hasArrFn = /function\s+(_0x[0-9a-f]{3,})\s*\(\)\s*\{[\s\S]{0,2000}return\s+\[/.test(code);
  const hasDecFn = /function\s+(_0x[0-9a-f]{3,})\s*\(\s*[_$a-zA-Z0-9]+\s*,\s*[_$a-zA-Z0-9]+\s*\)\s*\{[\s\S]{200,8000}IEgssj/.test(code);
  if (!hasArrFn || !hasDecFn) return code;

  // 提取函数名
  const arrName = (code.match(/function\s+(_0x[0-9a-f]{3,})\s*\(\)\s*\{/i) || [])[1];
  const decName = (code.match(/function\s+(_0x[0-9a-f]{3,})\s*\(\s*[_$a-zA-Z0-9]+\s*,\s*[_$a-zA-Z0-9]+\s*\)\s*\{/i) || [])[1];
  if (!arrName || !decName) return code;

  // 提取函数体（尽量局部提取，避免运行整份脚本）
  const arrBody = extractWholeFunction(code, arrName);
  const decBody = extractWholeFunction(code, decName);
  if (!arrBody || !decBody) return code;

  // 可选：若存在“版本常量”也一并放入，防止依赖
  const odhInit = (code.match(/var\s+(_0xodH)\s*=\s*['"][^'"]+['"];/) || [])[0] || '';

  // 组装一个最小可执行片段进沙箱
  const bootstrap = `
    ${odhInit}
    ${arrBody}
    ${decBody}
    globalThis.atob = globalThis.atob || (${atobPoly.toString()});
    // 导出到全局以便调用
    globalThis.__ARR__ = ${arrName};
    globalThis.__DEC__ = ${decName};
  `;

  let ctx = { console };
  vm.createContext(ctx);
  try {
    vm.runInContext(bootstrap, ctx, { timeout: 1000 });
  } catch (e) {
    notes?.push?.(`jsjiami_v7_rc4 bootstrap failed: ${e.message}`);
    return code;
  }
  if (typeof ctx.__ARR__ !== 'function' || typeof ctx.__DEC__ !== 'function') {
    return code;
  }

  // 先探测能否解出一个样本
  try { void ctx.__DEC__(0, 'test'); } catch (_) { /* 忽略 */ }

  // 替换所有形如  _0x1e61(0xNN,'xxx') 的调用
  const callRe = new RegExp(`${decName}\$begin:math:text$\\\\s*(0x[0-9a-f]+|\\\\d+)\\\\s*,\\\\s*'([^']+)'\\\\s*\\$end:math:text$`, 'gi');
  let replaced = 0;
  const out = code.replace(callRe, (_, idxRaw, key) => {
    try {
      const idx = idxRaw.startsWith('0x') ? parseInt(idxRaw, 16) : parseInt(idxRaw, 10);
      const text = ctx.__DEC__(idx, key);
      replaced++;
      return JSON.stringify(text); // 安全输出字面量
    } catch (e) {
      return _; // 保留原样
    }
  });

  if (replaced > 0) notes?.push?.(`jsjiami_v7_rc4: replaced ${replaced} calls via sandbox`);
  return out;
}

/** 提取以 function <name>( 开头的完整函数文本（简单括号计数） */
function extractWholeFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  // 找到第一个 '{'
  const braceStart = src.indexOf('{', start);
  if (braceStart < 0) return '';
  let i = braceStart, depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return src.slice(start, i);
}