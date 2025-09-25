// src/plugin/extra-codecs/jsjiami_v7_rc4.js
import vm from 'node:vm';

/**
 * 尝试从多种形式中提取函数源码（字符串表 / 解码器）
 * 支持：
 *  - function name(...) { ... }
 *  - var name = function(...) { ... }
 *  - name = function(...) { ... }
 *  - const name = function(...) { ... }
 *
 * 返回 { name, src, start, end } 或 null
 */
function findFunctionFlexible(source, namePattern) {
  // 1) 传统 function 声明
  let re = new RegExp(`function\\s+(${namePattern})\\s*\$begin:math:text$[^)]*\\$end:math:text$\\s*\\{`, 'g');
  let m = re.exec(source);
  if (m) return extractFullBlock(source, m.index, re.lastIndex, m[1]);

  // 2) var/let/const name = function (...) { ... }
  re = new RegExp(`(?:var|let|const)\\s+(${namePattern})\\s*=\\s*function\\s*\$begin:math:text$[^)]*\\$end:math:text$\\s*\\{`, 'g');
  m = re.exec(source);
  if (m) return extractFullBlock(source, m.index, re.lastIndex, m[1]);

  // 3) assignment: name = function(...) { ... }
  re = new RegExp(`(${namePattern})\\s*=\\s*function\\s*\$begin:math:text$[^)]*\\$end:math:text$\\s*\\{`, 'g');
  m = re.exec(source);
  if (m) return extractFullBlock(source, m.index, re.lastIndex, m[1]);

  return null;
}

/**
 * 从当前位置向前找到函数名开始位置并向后找到大括号配对结束，返回完整 src 片段
 */
function extractFullBlock(source, matchStart, bracePosGuess, foundName) {
  // 寻找最左边的 "function" 或等号开始处作为起点（保守）
  let start = matchStart;
  // 从 bracePosGuess - 1 （应该指向 '{'）开始配对
  let i = bracePosGuess - 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{') break;
    i++;
  }
  if (i >= source.length) return null;
  let depth = 0;
  let end = -1;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  const src = source.slice(start, end);
  return { name: foundName, src, start, end };
}

/**
 * 直接尝试提取 "大的数组字面量"（回退策略）
 * 返回代码片段（例如 "[ 'Wxxx', 'Wyyy', ... ]"）或 null
 */
function findBigArrayLiteral(source) {
  // 选取一个较长的 array 字面量片段（至少 200 字符）
  const re = /\[([^\]]{200,}?)\]/g;
  let m;
  while ((m = re.exec(source))) {
    const candidate = m[0];
    // 额外检查是否包含很多形如 "W" 的短字符串（jsjiami 特征）
    const cnt = (candidate.match(/'W|\"W/g) || []).length;
    if (cnt > 4) return { src: candidate, start: m.index, end: re.lastIndex };
  }
  return null;
}

function evalInSandbox(code, context = {}, opts = {}) {
  const ctx = Object.assign({}, context);
  vm.createContext(ctx);
  return vm.runInContext(code, ctx, Object.assign({ timeout: 300 }, opts));
}

function buildDecoderSandbox(tableSrc, decoderSrc, tableName, decoderName) {
  // 注入 _0xodH 防止内部引用报错
  const context = { _0xodH: 'jsjiami.com.v7' };
  vm.createContext(context);
  const wrapped = `
    "use strict";
    ${tableSrc}
    ${decoderSrc}
    // 导出接口
    ({ decode: function(i,k){ try { return ${decoderName}(i,k); } catch(e) { return undefined; } } })
  `;
  return vm.runInContext(wrapped, context, { timeout: 400 });
}

/**
 * 主函数：尝试解密并替换源码中可确定的解码调用
 */
export default function jsjiamiV7Rc4(source, { notes } = {}) {
  try {
    // 1) 先尝试找到字符串表函数（名字形式 _0x...）
    let tableFn = findFunctionFlexible(source, '_0x[0-9a-fA-F]{3,}');
    let tableArr = null;
    let tableName = tableFn?.name;

    if (tableFn) {
      try {
        // 在沙箱执行并取返回值（通常是数组）
        const evalCode = `(function(){ ${tableFn.src}; if(typeof ${tableName} !== 'function') throw new Error('not func'); return ${tableName}(); })()`;
        tableArr = evalInSandbox(evalCode, { _0xodH: 'jsjiami.com.v7' });
        if (!Array.isArray(tableArr)) {
          notes?.push?.('jsjiamiV7Rc4: string table function found but did not return array');
          tableArr = null;
        }
      } catch (e) {
        notes?.push?.(`jsjiamiV7Rc4: string table eval failed (${e.message})`);
        tableArr = null;
      }
    }

    // 2) 如果函数方式失败，尝试直接找到大数组字面量
    let tableLiteral = null;
    if (!tableArr) {
      const arrCandidate = findBigArrayLiteral(source);
      if (arrCandidate) {
        try {
          // 将数组包在表达式里 eval
          const evalCode = `(function(){ const _ = ${arrCandidate.src}; return _; })()`;
          const arr = evalInSandbox(evalCode, { _0xodH: 'jsjiami.com.v7' });
          if (Array.isArray(arr)) {
            tableArr = arr;
            tableLiteral = { src: arrCandidate.src, start: arrCandidate.start, end: arrCandidate.end };
            notes?.push?.('jsjiamiV7Rc4: string table extracted from big array literal');
          }
        } catch (e) {
          notes?.push?.(`jsjiamiV7Rc4: big array eval failed (${e.message})`);
        }
      }
    }

    if (!tableArr) {
      notes?.push?.('jsjiamiV7Rc4: string table function not found');
      return source;
    }

    // 3) 找解码器函数（decoder）
    const decFn = findFunctionFlexible(source, '_0x[0-9a-fA-F]{3,}');
    if (!decFn) {
      notes?.push?.('jsjiamiV7Rc4: decoder function not found');
      return source;
    }

    // 如果 table 是通过字面量方式获得的，我们还需要一个简单的 table function src 以便 decoder 沙箱能访问
    let tableFuncSrc = '';
    if (tableFn) {
      tableFuncSrc = tableFn.src;
    } else if (tableLiteral) {
      // 构造一个简单的函数返回此数组，名字用 _0x1715_fallback_xx
      const tname = '_0x1715_fallback';
      tableName = tname;
      tableFuncSrc = `function ${tname}(){return ${tableLiteral.src};}`;
      // 插入到 source 不变的前提下，仅为沙箱准备
    }

    // 4) 在沙箱中构建 decoder（含 table），并拿到实际 decode 调用
    let sandbox;
    try {
      sandbox = buildDecoderSandbox(tableFuncSrc, decFn.src, tableName, decFn.name);
    } catch (e) {
      notes?.push?.(`jsjiamiV7Rc4: sandbox build failed (${e.message})`);
      return source;
    }

    // 5) 寻找并替换源码中可静态解析的调用： decoder(NUM, 'key')
    const callRe = new RegExp(`\\b${decFn.name}\$begin:math:text$\\\\s*(0x[0-9a-fA-F]+|\\\\d+)\\\\s*,\\\\s*(['"])([^'"]*)\\\\2\\\\s*\\$end:math:text$`, 'g');

    let replaced = 0;
    const out = source.replace(callRe, (m, idxLit, q, key) => {
      try {
        const idx = idxLit.startsWith('0x') ? parseInt(idxLit, 16) : parseInt(idxLit, 10);
        const val = sandbox.decode(idx, key);
        if (typeof val === 'string') {
          replaced++;
          return JSON.stringify(val);
        }
      } catch (e) {
        // 忽略单个替换错误，保持原样
      }
      return m;
    });

    if (replaced > 0) {
      notes?.push?.(`jsjiamiV7Rc4: replaced ${replaced} calls via sandbox`);
      return out;
    } else {
      notes?.push?.(`jsjiamiV7Rc4: no calls matched for ${decFn.name}`);
      return source;
    }
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: unexpected error: ${e.message}`);
    return source;
  }
}