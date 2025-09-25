// src/plugin/extra-codecs/jsjiami_v7_rc4.js
import vm from "node:vm";

/* ------------ 小工具：匹配函数定义 / 大数组 / 提取块 ------------- */
function extractBlock(source, openPos) {
  let i = openPos, depth = 0;
  for (; i < source.length; i++) if (source[i] === "{") { depth = 1; i++; break; }
  if (!depth) return null;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (!depth) return i + 1; }
  }
  return null;
}

function findFuncByName(source, name) {
  // function name(...) { ... }
  let re = new RegExp(`function\\s+${name}\\s*\$begin:math:text$[^)]*\\$end:math:text$\\s*\\{`, "g");
  let m = re.exec(source);
  if (m) {
    const end = extractBlock(source, re.lastIndex - 1);
    if (end) return source.slice(m.index, end);
  }
  // var/let/const name = function(...) { ... }
  re = new RegExp(`(?:var|let|const)\\s+${name}\\s*=\\s*function\\s*\$begin:math:text$[^)]*\\$end:math:text$\\s*\\{`, "g");
  m = re.exec(source);
  if (m) {
    const end = extractBlock(source, re.lastIndex - 1);
    if (end) return source.slice(m.index, end);
  }
  // name = function(...) { ... }
  re = new RegExp(`${name}\\s*=\\s*function\\s*\$begin:math:text$[^)]*\\$end:math:text$\\s*\\{`, "g");
  m = re.exec(source);
  if (m) {
    const end = extractBlock(source, re.lastIndex - 1);
    if (end) return source.slice(m.index, end);
  }
  return null;
}

function findBigArrayLiteral(source) {
  const re = /\[((?:[^"'[\]]+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\[(?:[^\]]|\](?=[^,]))*\]){200,})\]/g;
  let m;
  while ((m = re.exec(source))) {
    const frag = m[0];
    const hits = (frag.match(/'W|\"W/g) || []).length;
    if (hits >= 4) return { src: frag, start: m.index, end: re.lastIndex };
  }
  return null;
}

/* ---------------------- 沙箱执行 ---------------------- */
function evalInSandbox(code, ctxObj = {}) {
  const ctx = { _0xodH: "jsjiami.com.v7", ...ctxObj };
  vm.createContext(ctx);
  return vm.runInContext(code, ctx, { timeout: 400 });
}

function buildDecoder(tableSrc, decoderSrc, tableName, decoderName) {
  const code = `
    "use strict";
    ${tableSrc}
    ${decoderSrc}
    (function(){
      function safeDecode(i,k){
        try { return ${decoderName}(i,k); } catch(e){ return undefined; }
      }
      return { decode: safeDecode };
    })();
  `;
  return evalInSandbox(code);
}

/* ---------------------- 主逻辑 ---------------------- */
export default function jsjiamiV7Rc4(source, { notes } = {}) {
  try {
    // ① 抓调用点，反推出“解码器函数名”
    //   形如  _0x1e61(0x12a, 'key') 或 _0x1e61(123, "key")
    const callRe = /\b(_0x[0-9a-fA-F]{3,})\(\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*(['"])([^'"]*)\3\s*\)/g;
    const foundNames = new Set();
    let m;
    while ((m = callRe.exec(source))) foundNames.add(m[1]);

    if (!foundNames.size) {
      notes?.push?.("jsjiamiV7Rc4: no decoder-like callsites");
      return source;
    }

    // ② 拿“字符串表”
    let tableArr = null, tableName = null, tableFuncSrc = null;
    // 先尝试函数名常见：_0x1715 / _0x[a-f0-9]{3,}
    const guessNames = ["_0x1715"];
    // 从源码里再抓一个 function 返回数组的函数
    const funcLike = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\)\s*\{\s*const\s+[A-Za-z_$][\w$]*\s*=\s*function\s*\(\)\s*\{\s*return\s*\[/;
    const f2 = funcLike.exec(source);
    if (f2) guessNames.push(f2[1]);

    // 直接回退：大数组字面量
    const literal = findBigArrayLiteral(source);
    if (literal) {
      try {
        tableArr = evalInSandbox(`(function(){return ${literal.src};})()`);
        tableName = "_0x1715_fallback";
        tableFuncSrc = `function ${tableName}(){return ${literal.src};}`;
        notes?.push?.("jsjiamiV7Rc4: string table extracted from big array literal");
      } catch (e) {
        notes?.push?.(`jsjiamiV7Rc4: big array eval failed (${e.message})`);
      }
    }

    // 如果还没有，试着按常见名字找函数并执行
    if (!tableArr) {
      for (const nm of guessNames) {
        const src = findFuncByName(source, nm);
        if (!src) continue;
        try {
          const arr = evalInSandbox(`(function(){ ${src}; return ${nm}(); })()`);
          if (Array.isArray(arr)) {
            tableArr = arr;
            tableName = nm;
            tableFuncSrc = src;
            break;
          }
        } catch (_) {}
      }
    }

    if (!tableArr || !Array.isArray(tableArr)) {
      notes?.push?.("jsjiamiV7Rc4: string table function not found");
      return source;
    }

    // ③ 逐个候选的“解码器名”，尝试找到定义并替换调用
    let replacedTotal = 0;
    let out = source;

    for (const decName of foundNames) {
      const decSrc = findFuncByName(source, decName);
      if (!decSrc) {
        // 找不到定义，跳过这个名字
        continue;
      }

      let sandbox;
      try {
        sandbox = buildDecoder(tableFuncSrc, decSrc, tableName, decName);
      } catch (e) {
        // 某些解码器包裹太多，构建失败也跳过
        continue;
      }

      // 在 out 上替换这个“名字”的所有静态调用
      const perNameRe = new RegExp(
        `\\b${decName}\$begin:math:text$\\\\s*(0x[0-9a-fA-F]+|\\\\d+)\\\\s*,\\\\s*(['"])([^'"]*)\\\\2\\\\s*\\$end:math:text$`,
        "g"
      );

      let replaced = 0;
      out = out.replace(perNameRe, (m2, idxLit, q, key) => {
        try {
          const idx = idxLit.startsWith("0x") ? parseInt(idxLit, 16) : parseInt(idxLit, 10);
          const val = sandbox.decode(idx, key);
          if (typeof val === "string") {
            replaced++;
            return JSON.stringify(val);
          }
        } catch {}
        return m2;
      });

      if (replaced) {
        replacedTotal += replaced;
        notes?.push?.(`jsjiamiV7Rc4: ${decName} => replaced ${replaced} calls`);
      }
    }

    if (replacedTotal) return out;
    notes?.push?.("jsjiamiV7Rc4: decoder function found but no static calls matched");
    return source;
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: unexpected error: ${e.message}`);
    return source;
  }
}