// src/plugin/extra-codecs/jsjiami_v7_rc4.js
// 识别并沙箱执行 jsjiami v7 的 RC4 解密器，然后把形如 _0x1e61(0xea, 'lUu0') 的调用替换为字面量字符串。

import vm from 'vm';

/** 从某个位置起，按花括号配对截取完整 function 源码 */
function sliceBalancedFunction(code, startIdx) {
  let i = startIdx;
  // 找到第一个 '{'
  while (i < code.length && code[i] !== '{') i++;
  if (i >= code.length || code[i] !== '{') return null;

  let depth = 0;
  let j = i;
  for (; j < code.length; j++) {
    const ch = code[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(startIdx, j + 1);
      }
    }
  }
  return null;
}

/** 尝试匹配：function NAME(...) 或 var/const NAME = function(...) */
function findDecryptorName(code) {
  // 先找 function NAME(...)
  let m =
    code.match(/\bfunction\s+(_0x[a-f0-9]{3,})\s*\(/i) ||
    code.match(/\b(?:var|let|const)\s+(_0x[a-f0-9]{3,})\s*=\s*function\s*\(/i);
  return m ? m[1] : null;
}

/** 找到 _0x1715 的函数名（有时也会是其它类似命名，但常见是 _0x1715） */
function findStringTableFuncName(code) {
  // 优先找 _0x1715，找不到再兜底匹配 “返回数组.concat(…)” 的典型结构
  if (/\bfunction\s+_0x1715\s*\(/.test(code) || /\b(?:var|let|const)\s+_0x1715\s*=/.test(code)) {
    return '_0x1715';
  }
  const m =
    code.match(
      /\bfunction\s+(_0x[a-f0-9]{3,})\s*\([^)]*\)\s*\{\s*[^}]*return\s+\[.*?\]\.concat\(/is
    ) ||
    code.match(
      /\b(?:var|let|const)\s+(_0x[a-f0-9]{3,})\s*=\s*function\s*\([^)]*\)\s*\{\s*[^}]*return\s+\[.*?\]\.concat\(/is
    );
  return m ? m[1] : null;
}

/** 提取完整函数源码（支持两种声明方式） */
function extractFullFunctionSource(code, funcName) {
  // 1) function NAME(
  let m = code.match(
    new RegExp(`\\bfunction\\s+${funcName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\(`)
  );
  if (m) {
    const start = m.index;
    return sliceBalancedFunction(code, start);
  }
  // 2) var/let/const NAME = function(
  m = code.match(
    new RegExp(
      `\\b(?:var|let|const)\\s+${funcName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*=\\s*function\\s*\\(`
    )
  );
  if (m) {
    const start = m.index;
    return sliceBalancedFunction(code, start);
  }
  return null;
}

/** 在沙箱里创建解密函数 */
function buildSandboxDecryptor({ code, decName, tableName, notes }) {
  const decSrc = extractFullFunctionSource(code, decName);
  if (!decSrc) {
    notes?.push?.(`jsjiamiV7Rc4: decryptor source not found for ${decName}`);
    return null;
  }

  const tblSrc = tableName ? extractFullFunctionSource(code, tableName) : null;
  if (!tblSrc) {
    notes?.push?.(`jsjiamiV7Rc4: string table function not found (${tableName || 'unknown'})`);
    return null;
  }

  // 注入必要的环境：_0xodH、$request/$response 等置空，避免副作用
  const ctx = {
    console,
    module: {},
    exports: {},
    globalThis: {},
  };
  vm.createContext(ctx);

  const scaffold = `
    var _0xodH = 'jsjiami.com.v7';
    ${tblSrc}
    ${decSrc}
    module.exports = { dec: ${decName} };
  `;

  try {
    vm.runInContext(scaffold, ctx, { timeout: 200, filename: 'rc4_scaffold.js' });
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: scaffold failed: ${e.message}`);
    return null;
  }

  const dec = ctx.module?.exports?.dec;
  if (typeof dec !== 'function') {
    notes?.push?.(`jsjiamiV7Rc4: decryptor not a function`);
    return null;
  }
  return dec;
}

/** 把 dec(0xea,'xx') 替换为字面量 */
function replaceCallsWithLiterals(code, decName, dec, { notes }) {
  let count = 0;

  // 形如：_0x1e61(0xea,'lUu0') / _0x1e61(234,'key')
  const callRe = new RegExp(
    `${decName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\(\\s*(0x[0-9a-fA-F]+|\\d+)\\s*,\\s*(['"])([^'"]+)\\2\\s*\\)`,
    'g'
  );

  const out = code.replace(callRe, (_m, idxLit, _q, key) => {
    try {
      const idx = idxLit.startsWith('0x') ? parseInt(idxLit, 16) : parseInt(idxLit, 10);
      const val = dec(idx, key);
      // 用 JSON.stringify 生成安全的 JS 字面量字符串
      count++;
      return JSON.stringify(val);
    } catch (e) {
      // 保守：替换失败就不改动
      return _m;
    }
  });

  if (count > 0) notes?.push?.(`jsjiamiV7Rc4: replaced ${count} calls via sandbox`);
  else notes?.push?.(`jsjiamiV7Rc4: no calls matched for ${decName}`);

  return out;
}

export default function jsjiamiV7Rc4Plugin(code, { notes } = {}) {
  try {
    // 粗筛：必须出现标识或典型结构
    if (!/jsjiami\.com\.v7/.test(code) && !/_0xodH\s*=/.test(code)) {
      notes?.push?.('jsjiamiV7Rc4: marker not found, skipped');
      return code;
    }

    const decName = findDecryptorName(code);
    const tableName = findStringTableFuncName(code);

    if (!decName || !tableName) {
      notes?.push?.(
        `jsjiamiV7Rc4: decryptor definition not found (dec=${decName || '-'}, table=${
          tableName || '-'
        })`
      );
      return code;
    }

    const dec = buildSandboxDecryptor({ code, decName, tableName, notes });
    if (!dec) return code;

    const out = replaceCallsWithLiterals(code, decName, dec, { notes });
    return out;
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: fatal ${e.message}`);
    return code;
  }
}