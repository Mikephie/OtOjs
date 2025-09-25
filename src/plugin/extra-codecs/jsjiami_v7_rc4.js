// src/plugin/extra-codecs/jsjiami_v7_rc4.js
import { VM } from 'vm2';

/** 同时兼容
 *   function NAME(...) { ... }
 *   var/let/const NAME = function(...) { ... }
 */
function findFunction(code, name) {
  const reFn  = new RegExp(`function\\s+(${name})\\s*\$begin:math:text$([^)]*)\\$end:math:text$\\s*{([\\s\\S]*?)}`, 'm');
  const reVar = new RegExp(`(?:var|let|const)\\s+(${name})\\s*=\\s*function\\s*\$begin:math:text$([^)]*)\\$end:math:text$\\s*{([\\s\\S]*?)}`, 'm');
  const m = reFn.exec(code) || reVar.exec(code);
  if (!m) return null;
  return { full: m[0], name: m[1], params: m[2], body: m[3] };
}

/** 在解密函数体里寻找 “= 某名字();” 推断数组工厂名 */
function guessArrayFactoryName(decBody) {
  const m = /=\s*([$_A-Za-z]\w*)\s*\(\)\s*;/.exec(decBody);
  return m ? m[1] : null;
}

/** 兜底：在全局找一个返回大数组/concat 的函数当作数组工厂 */
function fuzzyFindArrayFactory(code) {
  // 直接返回数组字面量
  let m = /function\s+([$_A-Za-z]\w*)\s*\(\)\s*{\s*return\s*\[\s*(['"][\s\S]*?['"]\s*,){5,}[\s\S]*?\]\s*;?\s*}/m.exec(code);
  if (m) return { full: m[0], name: m[1] };
  // 多段 concat 拼接的大数组
  m = /function\s+([$_A-Za-z]\w*)\s*\(\)\s*{[\s\S]{0,200}return[\s\S]*?\.concat\(/m.exec(code);
  if (m) return { full: m[0], name: m[1] };
  return null;
}

export default function jsjiamiV7Rc4(code, { notes } = {}) {
  try {
    // 1) 找解密函数（常见叫 _0x1e61，已解密后名字可能没变）
    const dec = findFunction(code, '[_$A-Za-z]\\w{3,}'); // 允许任意名字；后面再确认
    // 最可靠方式：先按常用名找，找不到再做“确认”
    const decByName = findFunction(code, '_0x1e61') || dec;

    if (!decByName) {
      notes?.push?.('jsjiamiV7Rc4: decryptor not found');
      return code;
    }

    // 2) 从解密函数体里推断数组工厂名
    const arrNameGuess = guessArrayFactoryName(decByName.body);
    let arr;
    if (arrNameGuess) {
      arr = findFunction(code, arrNameGuess);
    }
    if (!arr) arr = findFunction(code, '_0x1715') || fuzzyFindArrayFactory(code);

    if (!arr) {
      notes?.push?.('jsjiamiV7Rc4: array factory not found');
      return code;
    }

    const decName = decByName.name;

    // 3) 在沙箱里只挂载这两个函数，避免执行其它逻辑
    const vm = new VM({ timeout: 1000, sandbox: { Buffer } });
    vm.run(`${arr.full}\n${decByName.full}`);

    let replaced = 0;

    // 4) 先匹配双参调用：dec(0x123, "key")
    const reTwo = new RegExp(`${decName}\\((0x[0-9a-fA-F]+|\\d+)\\s*,\\s*(['"])([^'"]*)\\2\\)`, 'g');
    code = code.replace(reTwo, (m, idxTxt, _q, keyTxt) => {
      try {
        const idx = Number(idxTxt);
        const val = vm.run(`${decName}(${idx}, ${JSON.stringify(keyTxt)})`);
        replaced++;
        return JSON.stringify(val);
      } catch { return m; }
    });

    // 5) 再匹配单参调用：dec(0x123)
    const reOne = new RegExp(`${decName}\$begin:math:text$(0x[0-9a-fA-F]+|\\\\d+)\\$end:math:text$`, 'g');
    code = code.replace(reOne, (m, idxTxt) => {
      try {
        const idx = Number(idxTxt);
        const val = vm.run(`${decName}(${idx})`);
        replaced++;
        return JSON.stringify(val);
      } catch { return m; }
    });

    notes?.push?.(`jsjiamiV7Rc4: replaced ${replaced} calls`);
    return code;
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: error ${e.message}`);
    return code;
  }
}