// decode-all.js — OtOjs 前端解密插件总汇
// 集成：AAEncode, Eval/Packer, JSFuck
// 用法：app.js 中的 smartDecodePipeline() 会依次调用

window.DecodePlugins = window.DecodePlugins || {};

// ========== AADecode 插件 ==========
(function () {
  function extractHeader(code) {
    const aaStartIndex = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
    if (aaStartIndex > 0) {
      const header = code.substring(0, aaStartIndex).trim();
      const encodedPart = code.substring(aaStartIndex);
      return { header, encodedPart };
    }
    return { header: "", encodedPart: code };
  }
  function plugin(code) {
    try {
      const { header, encodedPart } = extractHeader(code);
      if (!(encodedPart.includes("ﾟДﾟ") || encodedPart.includes("(ﾟΘﾟ)") || encodedPart.includes("ﾟωﾟﾉ") || encodedPart.includes("ﾟдﾟ"))) {
        return null;
      }
      let decodePart = encodedPart;
      decodePart = decodePart.replace(") ('_')", "");
      decodePart = decodePart.replace("(ﾟДﾟ) ['_'] (", "return ");
      const x = new Function(decodePart);
      const decodedContent = x();
      if (header) return `${header}\n\n${decodedContent}`;
      return decodedContent;
    } catch (e) {
      console.error("[AAdecode] 解码失败:", e);
      return null;
    }
  }
  window.DecodePlugins.aadecode = {
    detect: function (code) {
      return code.includes("ﾟωﾟﾉ") || code.includes("ﾟДﾟ") || code.includes("ﾟдﾟ") || code.includes("ﾟΘﾟ");
    },
    plugin
  };
})();

/* =================== Eval / Packer（超强·无副作用捕获） =================== */
(function registerEvalPacker() {
  // 允许 r/d 作为最后形参；空白灵活
  function looksLikePacker(code) {
    return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*(r|d)\s*\)\s*\{/.test(code);
  }

  // 静态解析 packer 的六参调用：eval(function(p,a,c,k,e,d){...})('<payload>',radix,count,'w1|w2|...', '|', 0,{})
  function extractPackerParams(code) {
    const head = `eval\\s*\\(\\s*function\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*(?:r|d)\\s*\\)\\s*\\{[\\s\\S]*?\\}\\s*\\(\\s*`;
    const tail = `\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([\\'"\\\`])([\\s\\S]*?)\\3\\s*\\.split\\s*\\(\\s*([\\'"\\\`])([\\s\\S]*?)\\5\\s*\\)\\s*,\\s*(\\d+)\\s*,\\s*\\{\\s*\\}\\s*\\)\\s*\\)`;
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

  // 回填字典并替换（自后向前，避免前缀碰撞）
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

  // —— 文本级“预解”以便直接抓字符串 —— //
  function _tryDecodeHexEscapes(s) {
    try {
      return s
        .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    } catch { return s; }
  }
  function _tryFromCharCode(s) {
    return s.replace(/String\.fromCharCode\s*\(\s*([^)]+?)\s*\)/g, (m, list) => {
      try {
        const arr = Function(`"use strict";return [${list}]`)();
        return Array.isArray(arr) ? arr.map(n => String.fromCharCode(Number(n)||0)).join("") : m;
      } catch { return m; }
    });
  }
  function _tryArrayJoin(s) {
    let out = s;
    out = out.replace(/\[\s*([^\]]+?)\s*\]\.join\(\s*(['"])\s*\2\s*\)/g, (m, list) => {
      try { const arr = Function(`"use strict";return [${list}]`)(); return Array.isArray(arr)? arr.join("") : m; } catch { return m; }
    });
    out = out.replace(/\[\s*([^\]]+?)\s*\]\s*\.map\([^)]*String\.fromCharCode[^)]*\)\s*\.join\(\s*(['"])\s*\2\s*\)/g, (m, list) => {
      try { const arr = Function(`"use strict";return [${list}]`)(); return Array.isArray(arr)? arr.map(n=>String.fromCharCode(Number(n)||0)).join("") : m; } catch { return m; }
    });
    return out;
  }
  function _tryAtobInline(s) {
    return s.replace(/atob\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/g, (m, q, b64) => {
      try {
        const bin = typeof atob !== "undefined" ? atob(b64)
          : (typeof Buffer !== "undefined" ? Buffer.from(String(b64), "base64").toString("binary") : b64);
        return JSON.stringify(bin);
      } catch { return m; }
    });
  }

  function staticPullPayload(code) {
    let pre = code;
    pre = _tryAtobInline(pre);
    pre = _tryFromCharCode(pre);
    pre = _tryArrayJoin(pre);
    pre = _tryDecodeHexEscapes(pre);

    const m1 = pre.match(/\beval\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
    if (m1) return m1[2];
    const m2 = pre.match(/\(\s*0\s*,\s*eval\s*\)\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
    if (m2) return m2[2];
    const m3 = pre.match(/(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
    if (m3) return m3[2];
    const m4 = pre.match(/set(?:Timeout|Interval)\s*\(\s*([`'"])([\s\S]*?)\1\s*,/i);
    if (m4) return m4[2];
    const m5 = pre.match(/\bnew?\s*Function\s*\(\s*([`'"])([\s\S]*?)\1\s*\)\s*\(\s*\)/i);
    if (m5) return m5[2];

    const mw = pre.match(/document\.write\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/i);
    if (mw) {
      try {
        const html = JSON.parse(mw[1] + mw[2] + mw[1]);
        const sm = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (sm) return sm[1];
      } catch {}
    }
    return null;
  }

  // —— 两种“安全捕获”，都不真正执行业务代码 —— //
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
    let lastWrite = "";
    const hookWrite = (s) => { lastWrite = String(s); const m=lastWrite.match(/<script[^>]*>([\s\S]*?)<\/script>/i); if(m) captured=m[1]; };
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

  // —— 单轮尝试顺序：Packer静态 → 文本静态 → 语义替换 → 轻沙盒 —— //
  function unpackOnce(input) {
    let code = input;

    // 某些外层 IIFE/一元包装会挡住匹配，先剥一层（不改变语义）
    const mIife =
      code.match(/^\s*[!+~\-]?\s*\(?\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\)\s*;?\s*\(?\s*\)\s*;?\s*$/) ||
      code.match(/^\s*!\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\(\s*\)\s*;?\s*$/);
    if (mIife && mIife[1]) code = mIife[1];

    if (looksLikePacker(code)) {
      const p = extractPackerParams(code);
      if (p) {
        try {
          const out = unpackPacker(p);
          if (out && out !== code) return out;
        } catch {}
      }
    }
    const stat = staticPullPayload(code);
    if (stat && stat !== code) return stat;

    const byTrans = captureByTransform(code);
    if (byTrans && byTrans !== code) return byTrans;

    const bySand = captureBySandbox(code);
    if (bySand && bySand !== code) return bySand;

    return null;
  }

  function unwrapRecursive(code, maxDepth = 15) {
    let out = code;
    for (let i = 0; i < maxDepth; i++) {
      const next = unpackOnce(out);
      if (!next) break;
      if (next !== out) { out = String(next); continue; }
      break;
    }
    return out;
  }

  // 注册为插件；不动你的外层架构与顺序
  Plugins.evalpack = {
    name: "evalpack",
    detect(code) {
      return (
        /\beval\s*\(/.test(code) ||
        /\(\s*0\s*,\s*eval\s*\)\s*\(/.test(code) ||
        /(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(/.test(code) ||
        /set(?:Timeout|Interval)\s*\(\s*['"]/i.test(code) ||
        /\bnew?\s*Function\s*\(\s*['"]/.test(code) ||
        looksLikePacker(code)
      );
    },
    plugin(code) {
      try {
        const out = unwrapRecursive(code, 15);
        return out && out !== code ? out : null;
      } catch (e) { return null; }
    },
  };

  // 兼容旧命名（如果你外面用了 Plugins.eval）
  Plugins.eval = Plugins.evalpack;
})();


// ========== JSFuck 插件 ==========
(function () {
  function looksLikeJSFuck(code) {
    return /^[\[\]!\+\(\)]+$/.test(code.replace(/\s+/g, ""));
  }
  function plugin(code) {
    try {
      if (!looksLikeJSFuck(code) && !code.includes("(![]+[])")) return null;
      const res = eval(code); // JSFuck 本质是 eval
      return String(res);
    } catch (e) {
      console.error("[JSFuck] 解码失败:", e);
      return null;
    }
  }
  window.DecodePlugins.jsfuck = {
    detect: code => looksLikeJSFuck(code) || code.includes("(![]+[])"),
    plugin
  };
})();

// ========== 智能解密调度 ==========
async function smartDecodePipeline(code) {
  let out = code;
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of Object.keys(window.DecodePlugins)) {
      const p = window.DecodePlugins[key];
      if (p.detect(out)) {
        const res = p.plugin(out);
        if (res && res !== out) {
          out = res;
          changed = true;
        }
      }
    }
  }
  return out;
}

// 暴露到全局
window.DecodePlugins = window.DecodePlugins || {};
window.smartDecodePipeline = smartDecodePipeline;
