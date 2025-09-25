// src/plugin/extra-codecs/jsjiami_v7_rc4.js
import vm from 'node:vm';

function findFunc(code, namePattern) {
  // 匹配：function _0x123abc ( ... ) { ... }  —— 贪婪到平衡大括号
  const re = new RegExp(
    `function\\s+(${namePattern})\\s*\$begin:math:text$[^)]*\\$end:math:text$\\s*\\{`,
    'g'
  );
  const m = re.exec(code);
  if (!m) return null;

  const start = m.index;
  let i = re.lastIndex - 1; // 指向 '{'
  let depth = 0;
  for (; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const end = i + 1;
        return { name: m[1], start, end, src: code.slice(start, end) };
      }
    }
  }
  return null;
}

function evalStringTable(fnCode, tableName = '_0x1715') {
  // 注入 _0xodH，解决字符串表内引用 _0xodH 时的 NameError
  const context = { _0xodH: 'jsjiami.com.v7' };
  vm.createContext(context);
  const wrapped = `
    (function(){
      "use strict";
      ${fnCode}
      if (typeof ${tableName} !== 'function') throw new Error('${tableName} not found');
      return ${tableName}();
    })()
  `;
  return vm.runInContext(wrapped, context, { timeout: 200 });
}

function buildDecoderSandbox(tableFuncSrc, decoderFuncSrc, tableName, decoderName) {
  const context = { _0xodH: 'jsjiami.com.v7' };
  vm.createContext(context);
  const wrapped = `
    "use strict";
    ${tableFuncSrc}
    ${decoderFuncSrc}
    // 暴露方法
    ({ decode: function(i,k){ return ${decoderName}(i,k); } })
  `;
  return vm.runInContext(wrapped, context, { timeout: 300 });
}

export default function jsjiamiV7Rc4(source, { notes } = {}) {
  try {
    // 1) 找字符串表函数（常见命名形如 _0x1715）
    const tbl = findFunc(source, '_0x[0-9a-fA-F]{3,}');
    if (!tbl) {
      notes?.push?.('jsjiamiV7Rc4: string table function not found');
      return source;
    }

    // 确认它看起来像表函数：内部包含 array 字面与 concat 结构较明显
    // 直接尝试执行；执行失败时会抛出并被上层捕获
    let tableArr;
    try {
      tableArr = evalStringTable(tbl.src, tbl.name);
      if (!Array.isArray(tableArr)) {
        throw new Error('table not array');
      }
    } catch (e) {
      notes?.push?.(`jsjiamiV7Rc4: string table eval failed (${e.message})`);
      return source;
    }

    // 2) 找解码函数（通常在代码中有 "const _0xc3dd0a = _0x1e61" 这种绑定）
    // 先推断名字：从 "const XXX = YYY;" 形态里抓 YYY 是否是函数定义
    // 更稳妥：直接搜第一个满足模式的 function _0x????(a,b){...} 且内部有 "IEgssj" / "RC4" 结构
    const dec = findFunc(source, '_0x[0-9a-fA-F]{3,}');
    if (!dec) {
      notes?.push?.('jsjiamiV7Rc4: decoder function not found');
      return source;
    }

    // 3) 组建解码沙箱
    let sandbox;
    try {
      sandbox = buildDecoderSandbox(tbl.src, dec.src, tbl.name, dec.name);
    } catch (e) {
      notes?.push?.(`jsjiamiV7Rc4: sandbox build failed (${e.message})`);
      return source;
    }

    // 4) 扫描并替换调用：  _0x1e61(0xe7,'p4lg')  或  _0x1e61(231,'key')
    // 仅限第一参数是纯数字字面量（十六进制或十进制），第二参数是字符串字面量
    const callRe = new RegExp(`\\b${dec.name}\$begin:math:text$\\\\s*(0x[0-9a-fA-F]+|\\\\d+)\\\\s*,\\\\s*(['"])([^'"]*)\\\\2\\\\s*\\$end:math:text$`, 'g');

    let replaced = 0;
    const out = source.replace(callRe, (_m, idxLit, q, key) => {
      try {
        const idx = idxLit.startsWith('0x') ? parseInt(idxLit, 16) : parseInt(idxLit, 10);
        const val = sandbox.decode(idx, key);
        if (typeof val === 'string') {
          replaced++;
          // 使用 JSON.stringify 生成安全字符串字面量
          return JSON.stringify(val);
        }
      } catch (_) {}
      return _m; // 安全回退
    });

    if (replaced > 0) {
      notes?.push?.(`jsjiamiV7Rc4: replaced ${replaced} calls via sandbox`);
      return out;
    } else {
      notes?.push?.(`jsjiamiV7Rc4: no calls matched for ${dec.name}`);
      return source;
    }
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: error ${e.message}`);
    return source;
  }
}