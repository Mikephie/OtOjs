// decode-all.js — OtOjs 前端解密插件总汇（精简为只跑 eval + aadecode）
// 说明：优先使用你在 main/src/wrapper/*.js 里注册的同名插件；若不存在，则使用下面的“后备实现”。

// 不要清空已有插件，保留 wrapper 先注册的内容
window.DecodePlugins = window.DecodePlugins || {};

/* ================= AADecode 插件（仅在不存在同名插件时注册） ================= */
(function () {
  if (window.DecodePlugins.aadecode) return; // ★ 若 wrapper 已注册，直接使用

  function extractHeader(code) {
    const aaStartIndex = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
    if (aaStartIndex > 0) {
      const header = code.substring(0, aaStartIndex).trim();
      const encodedPart = code.substring(aaStartIndex);
      return { header, encodedPart };
    }
    return { header: "", encodedPart: code };
  }
  function aaDecodeOnce(code) {
    try {
      let s = code
        .replace(") ('_')", "")
        .replace("(ﾟДﾟ) ['_'] (", "return ")
        .replace(/^\s*[^=]+=\s*/, ""); // 去掉变量赋值
      /* eslint-disable no-new-func */
      return new Function(s)();
    } catch { return null; }
  }
  function plugin(code) {
    try {
      const { header, encodedPart } = extractHeader(code);
      if (!(/ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(encodedPart))) return null;
      const out = aaDecodeOnce(encodedPart);
      if (typeof out === "string" && out) return header ? `${header}\n\n${out}` : out;
      return null;
    } catch (e) {
      console.error("[AAdecode] 解码失败:", e);
      return null;
    }
  }
  window.DecodePlugins.aadecode = {
    detect: (code) => /ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(code),
    plugin
  };
})();

/* ========== Eval + Packer 插件（仅在不存在同名插件时注册） ========== */
(function () {
  if (window.DecodePlugins.eval) return; // ★ 若 wrapper 已注册，直接使用

  function looksLikePacker(code) {
    return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*(r|d)\s*\)\s*\{/.test(code);
  }

  function parsePackerParams(code) {
    const head =
      `eval\\s*\\(\\s*function\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*(?:r|d)\\s*\\)\\s*\\{[\\s\\S]*?\\}\\s*\\(\\s*`;
    const tail =
      `\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\'"\\\`])([\\s\\S]*?)\\3\\s*\\.split\\s*\\(\\s*([\\'"\\\`])([\\s\\S]*?)\\5\\s*\\)\\s*,\\s*(\\d+)\\s*,\\s*\\{\\s*\\}\\s*\\)\\s*\\)`;
    const core = new RegExp(head + `([\\'"\\\`])([\\s\\S]*?)\\1` + tail, "m");
    const m = code.match(core);
    if (!m) return null;
    return {
      payload: m[2],
      radix: parseInt(m[3]),
      count: parseInt(m[4]),
      wordsRaw: m[6],
      sep: m[7],
      countCheck: parseInt(m[8]),
    };
  }

  function unpackPacker(params) {
    const { payload, radix, count, wordsRaw, sep } = params;
    const words = wordsRaw.split(sep);
    function baseN(c) {
      c = parseInt(c, radix);
      return (c < radix ? "" : baseN(Math.floor(c / radix))) +
             ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    }
    let out = payload;
    for (let i = count - 1; i >= 0; i--) {
      const k = baseN(i);
      const v = words[i] ?? k;
      out = out.replace(new RegExp(`\\b${k}\\b`, "g"), v);
    }
    return out;
  }

  function staticPull(code) {
    // 直接 eval("…")
    let m = code.match(/\beval\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
    if (m) return m[2];
    // (0,eval)("…")
    m = code.match(/\(\s*0\s*,\s*eval\s*\)\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
    if (m) return m[2];
    // window['eval']("…")
    m = code.match(/(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
    if (m) return m[2];
    // setTimeout("…",…)
    m = code.match(/set(?:Timeout|Interval)\s*\(\s*([`'"])([\s\S]*?)\1\s*,/i);
    if (m) return m[2];
    // new Function("…")()
    m = code.match(/\bnew?\s*Function\s*\(\s*([`'"])([\s\S]*?)\1\s*\)\s*\(\s*\)/i);
    if (m) return m[2];
    // document.write('<script>…</script>')
    m = code.match(/document\.write\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/i);
    if (m) {
      try {
        const html = JSON.parse(m[1] + m[2] + m[1]);
        const sm = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (sm) return sm[1];
      } catch {}
    }
    return null;
  }

  function captureByTransform(code) {
    const replaced = code
      .replace(/\beval\s*\(/g, "(__CAP__)(")
      .replace(/\(\s*0\s*,\s*eval\s*\)\s*\(/g, "(__CAP__)(")
      .replace(/(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(/g, "(__CAP__)(")
      .replace(/set(?:Timeout|Interval)\s*\(\s*([`'"])([\s\S]*?)\1\s*,/gi, (m, q, body) => `(__CAP__)(${JSON.stringify(body)}),`)
      .replace(/\bnew?\s*Function\s*\(\s*([`'"])([\s\S]*?)\1\s*\)\s*\(\s*\)/gi, (m, q, body) => `(__CAP__)(${JSON.stringify(body)})`);
    const runner = `
      "use strict";
      var __PAYLOAD__=null; var __CAP__=(x)=>{ __PAYLOAD__=x; return x; };
      try{ ${replaced} }catch(e){}
      return __PAYLOAD__;
    `;
    try { return Function(runner)(); } catch { return null; }
  }

  function captureBySandbox(code) {
    let captured = null;
    const hookEval = (x)=> (captured = x);
    const hookTimeout = (fn)=>{ if (typeof fn === "string") captured = fn; return 0; };
    const hookFunction = function (...args) {
      if (args.length === 1 && typeof args[0] === "string") { captured = args[0]; return function () {}; }
      return function(){};
    };
    const hookWrite = (s) => {
      const html = String(s);
      const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      if (m) captured = m[1];
    };
    const sandbox = {
      eval: hookEval,
      window: { eval: hookEval },
      self: { eval: hookEval },
      globalThis: { eval: hookEval },
      document: { write: hookWrite },
      navigator: { userAgent: "Mozilla/5.0" },
      location: {},
      console,
      setTimeout: hookTimeout,
      setInterval: hookTimeout,
      Function: hookFunction,
      atob: typeof atob !== "undefined"
        ? atob
        : (s)=> typeof Buffer!=="undefined" ? Buffer.from(String(s),"base64").toString("binary") : s,
      btoa: typeof btoa !== "undefined"
        ? btoa
        : (s)=> typeof Buffer!=="undefined" ? Buffer.from(String(s),"binary").toString("base64") : s,
    };
    try { Function(...Object.keys(sandbox), `"use strict";try{${code}}catch(e){}`)(...Object.values(sandbox)); } catch {}
    return captured;
  }

  function unpackOnce(input) {
    let code = String(input);

    // 常见 IIFE/包装壳剥一层
    const iife =
      code.match(/^\s*[!+~\-]?\s*\(?\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\)\s*;?\s*\(?\s*\)\s*;?\s*$/) ||
      code.match(/^\s*!\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\(\s*\)\s*;?\s*$/);
    if (iife && iife[1]) code = iife[1];

    // 静态 packer 解包
    if (looksLikePacker(code)) {
      const p = parsePackerParams(code);
      if (p) {
        try {
          const out = unpackPacker(p);
          if (out && out !== code) return out;
        } catch {}
      }
    }

    // 纯文本拉取 / 语义替换捕获 / 沙盒捕获
    const stat = staticPull(code);
    if (stat && stat !== code) return stat;

    const byTrans = captureByTransform(code);
    if (byTrans && byTrans !== code) return byTrans;

    const bySand = captureBySandbox(code);
    if (bySand && bySand !== code) return bySand;

    return null;
  }

  function unpackAll(code, maxDepth = 15) {
    let out = String(code);
    for (let i = 0; i < maxDepth; i++) {
      const next = unpackOnce(out);
      if (!next) break;
      if (next !== out) { out = String(next); continue; }
      break;
    }
    return out;
  }

  function detect(code) {
    return (
      /\beval\s*\(/.test(code) ||
      /\(\s*0\s*,\s*eval\s*\)\s*\(/.test(code) ||
      /(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(/.test(code) ||
      /set(?:Timeout|Interval)\s*\(\s*['"]/i.test(code) ||
      /\bnew?\s*Function\s*\(\s*['"]/.test(code) ||
      looksLikePacker(code)
    );
  }
  function plugin(code) {
    try {
      const out = unpackAll(code, 15);
      return out && out !== code ? out : null;
    } catch { return null; }
  }

  window.DecodePlugins.eval = { detect, plugin };
})();

/* ================== 轻量分行 & 美化兜底 ================== */
function simpleFormat(src) {
  try {
    let out = "", indent = 0;
    const lines = String(src)
      .replace(/\r/g, "")
      .replace(/;/g, ";\n")
      .replace(/\{/g, "{\n")
      .replace(/\}/g, "\n}\n")
      .split("\n");
    for (let raw of lines) {
      let line = raw.trim();
      if (!line) continue;
      if (line.startsWith("}")) indent = Math.max(0, indent - 1);
      out += "  ".repeat(indent) + line + "\n";
      if (line.endsWith("{")) indent++;
    }
    return out.trim() + "\n";
  } catch { return String(src); }
}

function prettyFormat(code) {
  try {
    const hasPrettier = !!window.prettier;
    const rawPlugins = window.prettierPlugins;
    const plugins = Array.isArray(rawPlugins)
      ? rawPlugins
      : rawPlugins && rawPlugins.babel
      ? [rawPlugins.babel]
      : null;

    if (hasPrettier && plugins) {
      return window.prettier.format(code, { parser: "babel", plugins });
    }
  } catch {}
  return simpleFormat(code);
}

/* ================== 智能解密调度（只跑 eval + aadecode） ================== */
async function smartDecodePipeline(code) {
  let out = String(code);
  let changed = true;
  let rounds = 0;

  // 固定顺序：先 eval（含 packer 解包），再 aadecode
  const ORDER = ["eval", "aadecode"];

  while (changed && rounds < 20) {
    changed = false;
    rounds++;

    for (const key of ORDER) {
      const p = window.DecodePlugins && window.DecodePlugins[key];
      if (!p || typeof p.detect !== "function" || typeof p.plugin !== "function") continue;

      if (p.detect(out)) {
        const res = p.plugin(out);
        if (typeof res === "string" && res && res !== out) {
          out = res;
          changed = true;
          break; // 成功解一层，下一轮
        }
      }
    }
  }
  return prettyFormat(out);
}

// 暴露（保持与原项目一致）
window.DecodePlugins = window.DecodePlugins || {};
window.smartDecodePipeline = smartDecodePipeline;
