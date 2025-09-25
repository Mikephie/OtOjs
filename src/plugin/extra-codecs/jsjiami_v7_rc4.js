// src/plugin/extra-codecs/jsjiami_v7_rc4.js
// ESM module
import vm from 'vm';

/**
 * 尝试从代码中提取某个“function xxx(...) { ... }”的完整源码
 */
function extractFunctionSource(code, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = re.exec(code);
  if (!m) return null;
  let i = m.index;
  // 从 "function xxx(" 的开头向后扫描，匹配花括号配对，截出完整函数体
  // 寻找第一个 '{'
  const startBrace = code.indexOf('{', i);
  if (startBrace === -1) return null;
  let depth = 0;
  let end = startBrace;
  for (; end < code.length; end++) {
    const ch = code[end];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end++; // 包含末尾 '}'
        break;
      }
    }
  }
  if (depth !== 0) return null;
  return code.slice(i, end);
}

/**
 * 在代码中搜寻 “const/var/let <alias> = <target>;”
 * 比如：const _0xc3dd0a = _0x1e61;
 */
function findAliases(code, targetName) {
  const out = new Set([targetName]);
  const aliasRe = new RegExp(
    `\\b(const|let|var)\\s+(_0x[0-9a-fA-F]+)\\s*=\\s*${targetName}\\s*;`,
    'g'
  );
  let m;
  while ((m = aliasRe.exec(code))) {
    out.add(m[2]);
  }
  return Array.from(out);
}

/**
 * 建立 jsjiami v7 环境并返回可调用的解密函数
 */
function buildDecoder(code, { notes }) {
  // 1) 猜测函数名（解密函数与表函数）
  //   常见命名：_0x1e61 / _0x1715
  const decoderNameRE = /function\s+(_0x[0-9a-fA-F]{4,})\s*\(\s*[^)]*\)\s*\{\s*const\s+(_0x[0-9a-fA-F]{4,})\s*=\s*(_0x[0-9a-fA-F]{4,})\s*\(\s*\)\s*;/;
  const tableFuncNameRE = /function\s+(_0x[0-9a-fA-F]{4,})\s*\(\)\s*\{/;

  // 尝试直接找已知名字
  let decoderName = (code.match(/function\s+(_0x[0-9a-fA-F]{4,})\s*\(\s*_0x37ad72\s*,\s*_0xa65d17\)/) || [])[1] || '_0x1e61';
  let tableName = (code.match(/function\s+(_0x[0-9a-fA-F]{4,})\s*\(\)\s*\{\s*const\s+_0x213a1a/) || [])[1] || '_0x1715';

  // 如果模糊匹配失败，再用更宽松的 RE
  if (!/function\s+_0x[0-9a-fA-F]{4,}\s*\(/.test(extractFunctionSource(code, decoderName) || '')) {
    const hit = decoderNameRE.exec(code);
    if (hit) {
      decoderName = hit[1];
      tableName = hit[3]; // 命中 "const _xx = _yy()" 的 _yy
    }
  }
  if (!extractFunctionSource(code, tableName)) {
    const t = tableFuncNameRE.exec(code);
    if (t) tableName = t[1];
  }

  const decoderSrc = extractFunctionSource(code, decoderName);
  const tableSrc = extractFunctionSource(code, tableName);

  if (!decoderSrc || !tableSrc) {
    notes?.push?.(`jsjiamiV7Rc4: decoder or table source not found`);
    return null;
  }

  // 2) 提取 _0xodH（拼接里会用到），取不到就给默认值
  let odh = "jsjiami.com.v7";
  const mOdh = code.match(/\b_0xodH\b\s*=\s*['"]([^'"]+)['"]/)
           || code.match(/\bvar\s+_0xodH\s*=\s*['"]([^'"]+)['"]/)
           || code.match(/\bconst\s+_0xodH\s*=\s*['"]([^'"]+)['"]/);
  if (mOdh) odh = mOdh[1];

  // 3) 组装沙箱脚本
  const prefix = `
    var _0xodH = ${JSON.stringify(odh)};
    // 防止不相关全局报错
    var $request = {}, $response = {}, console = globalThis.console || {};
  `;
  const sandboxCode = `${prefix}\n${tableSrc}\n${decoderSrc}\n`;
  const ctx = vm.createContext({});
  try {
    vm.runInContext(sandboxCode, ctx, { timeout: 1000 });
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: vm build failed: ${e.message}`);
    return null;
  }

  const decoderFn = ctx[decoderName];
  if (typeof decoderFn !== 'function') {
    notes?.push?.(`jsjiamiV7Rc4: decoder function not found`);
    return null;
  }

  // 返回一个纯函数 (idx, key) => string
  function call(idxLiteral, key) {
    // idxLiteral 可能是十六进制字面量字符串 "0xeb" 或十进制 "235"
    let idx;
    try {
      const s = String(idxLiteral).trim();
      idx = s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10);
      if (!Number.isFinite(idx)) throw new Error('bad index');
    } catch {
      // 有些场景传的就是数字
      idx = idxLiteral;
    }

    try {
      // 直接调用沙箱中的真实解密器
      return decoderFn(idx, key);
    } catch (e) {
      // 解密器偶发依赖闭包状态时的兜底
      try {
        // 再给一次 eval 机会（极端场景）
        return vm.runInContext(`${decoderName}(${JSON.stringify(idx)}, ${JSON.stringify(key)})`, ctx, { timeout: 500 });
      } catch {
        return null;
      }
    }
  }

  return { decoderName, tableName, call };
}

/**
 * 主入口：查找并替换 jsjiami v7 rc4 的调用
 * - 支持：_0x1e61(0xeb,'1D%(') 双参
 * - 兼容：_0x1e61(0xeb) / _0x1e61('...') 单参兜底（返回占位）
 * - 自动处理别名：const _0xc3dd0a = _0x1e61;
 */
export default function jsjiamiV7Rc4Plugin(code, { notes } = {}) {
  let changed = 0;

  const dec = buildDecoder(code, { notes });
  if (!dec) {
    notes?.push?.(`jsjiamiV7Rc4: decoder build failed`);
    return code;
  }

  // 找到所有别名
  const names = findAliases(code, dec.decoderName);

  // 1) 双参替换：  fn( 0xAB , 'key' )
  const dualArg = new RegExp(
    `\\b(${names.join('|')})\\s*\\(\\s*(0x[0-9a-fA-F]+|\\d+)\\s*,\\s*(['"])([^'"]*)\\3\\s*\\)`,
    'g'
  );

  let out = code.replace(dualArg, (m, fn, idx, q, key) => {
    const s = dec.call(idx, key);
    if (typeof s === 'string') {
      changed++;
      // 以 JSON.stringify 包裹，避免特殊字符破坏语法
      return JSON.stringify(s);
    }
    // 失败留原样
    return m;
  });

  // 2) 单参兜底（很少见，仍给占位避免误伤）
  const singleArg = new RegExp(`\\b(${names.join('|')})\\s*\$begin:math:text$\\\\s*(0x[0-9a-fA-F]+|\\\\d+|['"][^'"]*['"])\\\\s*\\$end:math:text$`, 'g');
  out = out.replace(singleArg, (m, fn, arg) => {
    // 已在双参阶段替换过的大部分不会再命中；兜底做个标记即可
    return m; // 保守：不动单参，避免误替
  });

  notes?.push?.(`jsjiami_v7_rc4: replaced ${changed} dual-arg calls`);
  return out;
}