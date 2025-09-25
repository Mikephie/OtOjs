// src/plugin/extra-codecs/jsjiami_v7_rc4.js
// 兼容 jsjiami v7（RC4系）—— 单/双参调用均可匹配
// 依赖：vm2（已在 package.json 中）

import { VM } from 'vm2';

const STR_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';

/** 在代码中用正则抓取 "function name(...) { ... }" 的完整源码与位置 */
function findFunctionSource(code, predicate) {
  const fnRe = /function\s+([$\w]+)\s*\(([\s\S]*?)\)\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = fnRe.exec(code))) {
    const [full, name, params, body] = m;
    if (predicate({ name, params, body, full, index: m.index })) {
      return { name, params, body, full, index: m.index, end: m.index + full.length };
    }
  }
  return null;
}

/** 尝试定位 jsjiami v7 的解密函数（体内含 base64 表或 IEgssj 标记） */
function locateDecryptor(code) {
  return (
    findFunctionSource(
      code,
      ({ body }) => body.includes(STR_ALPHABET) || body.includes('IEgssj')
    ) || null
  );
}

/** 典型数组工厂：function _0x1715() { ... return [...]; } */
function locateArrayFactory(code) {
  return (
    findFunctionSource(code, ({ body }) => /return\s+[\[\(]/.test(body) && /concat\(/.test(body)) ||
    findFunctionSource(code, ({ body }) => /return\s+[\[\(]/.test(body) && body.includes('_0xodH'))
  );
}

/** 将十进制/十六进制数值文本转为 Number */
function readIndex(numText) {
  if (/^0x[0-9a-f]+$/i.test(numText)) return parseInt(numText, 16);
  return parseInt(numText, 10);
}

/** 转义以安全写回源码 */
function strLiteral(s) {
  return JSON.stringify(String(s));
}

/** 主入口：接收整段代码，返回替换后的代码（或原文） */
export default function jsjiamiV7Rc4(code, { notes } = {}) {
  try {
    const dec = locateDecryptor(code);
    const arr = locateArrayFactory(code);

    if (!dec || !arr) {
      notes?.push?.('jsjiamiV7Rc4: decryptor or array factory not found');
      return code;
    }

    const decName = dec.name;

    // 在替换前，先把两段函数源码临时打洞，避免误伤
    const HOLE_DEC = '/*__JSD__HOLE_DEC__*/';
    const HOLE_ARR = '/*__JSD__HOLE_ARR__*/';

    let work = code;
    work =
      work.slice(0, dec.index) +
      HOLE_DEC +
      work.slice(dec.end, arr.index) +
      HOLE_ARR +
      work.slice(arr.end);

    // 构建沙箱并注入两段定义
    const bootstrap = `${arr.full}\n${dec.full}\n`;
    const vm = new VM({
      timeout: 1000,
      sandbox: {
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        Buffer,
      },
    });
    vm.run(bootstrap);

    // 支持 单参/双参 的调用：
    // _0x1e61(0xea, "key") | _0x1e61(234) | _0x1e61 ( 0xea , 'k' )
    const callRe = new RegExp(
      `${decName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\(\\s*(0x[0-9a-fA-F]+|\\d+)\\s*(?:,\\s*(['"])([^'"]+)\\2)?\\s*\\)`,
      'g'
    );

    let replaced = 0;
    work = work.replace(callRe, (_m, idxText, _q, keyText) => {
      try {
        const idx = readIndex(idxText);
        const expr =
          keyText === undefined
            ? `${decName}(${idx})`
            : `${decName}(${idx}, ${strLiteral(keyText)})`;
        const decoded = vm.run(`${expr}`);
        replaced++;
        return strLiteral(decoded);
      } catch (e) {
        // 失败就不替换，保持原样
        return _m;
      }
    });

    // 还原两段函数定义
    // （注意：为了保持可复现性，我们把“洞”替换回原代码的原样函数体）
    work = work.replace(HOLE_DEC, dec.full).replace(HOLE_ARR, arr.full);

    notes?.push?.(`jsjiamiV7Rc4: replaced ${replaced} calls via sandbox`);
    if (replaced === 0) {
      notes?.push?.(`jsjiamiV7Rc4: no calls matched for ${decName}`);
    }

    return work;
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: error ${e.message}`);
    return code;
  }
}