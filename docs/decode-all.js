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

// ========== Eval + Dean Edwards Packer 插件 ==========
(function () {
  // 1) 识别“像 packer”的外形（最后参数可能是 r 或 d）
  function looksLikePacker(code) {
    return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*(r|d)\s*\)\s*\{/.test(code);
  }

  // 2) 尝试静态解析 Packer 六参调用（兼容引号/分隔符/空白）
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

  // 3) 回填词典（自后向前替换，避免前缀碰撞）
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

  // 4) 纯文本静态拉取：把“字符串里的代码”直接抠出来（不执行）
  function staticPull(code) {
    // atob("...") → "bin"
    code = code.replace(/atob\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/g, (m, q, b64) => {
      try {
        const bin = typeof atob !== "undefined"
          ? atob(b64)
          : (typeof Buffer !== "undefined"
              ? Buffer.from(String(b64), "base64").toString("binary")
              : b64);
        return JSON.stringify(bin);
      } catch { return m; }
    });
    // fromCharCode/数组拼接 → 明文
    code = code.replace(/String\.fromCharCode\s*\(\s*([^)]+?)\s*\)/g, (m, list) => {
      try {
        const arr = Function(`"use strict";return [${list}]`)();
        return Array.isArray(arr) ? arr.map(n=>String.fromCharCode(Number(n)||0)).join("") : m;
      } catch { return m; }
    }).replace(/\[\s*([^\]]+?)\s*\]\.join\(\s*(['"])\s*\2\s*\)/g, (m, list) => {
      try { const arr = Function(`"use strict";return [${list}]`)(); return Array.isArray(arr)? arr.join("") : m; }
      catch { return m; }
    });

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

  // 5) 语义替换捕获：把所有 eval 入口改成 __CAP__，拿字符串不执行
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

  // 6) 轻沙盒捕获：Hook eval/new Function/setTimeout/document.write
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

  // 7) 单轮：Packer静态 → 文本静态 → 语义替换 → 沙盒
  function unpackOnce(input) {
    let code = String(input);

    // 去掉最外层 IIFE/一元包装（常见）
    const iife =
      code.match(/^\s*[!+~\-]?\s*\(?\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\)\s*;?\s*\(?\s*\)\s*;?\s*$/) ||
      code.match(/^\s*!\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\(\s*\)\s*;?\s*$/);
    if (iife && iife[1]) code = iife[1];

    if (looksLikePacker(code)) {
      const p = parsePackerParams(code);
      if (p) {
        try {
          const out = unpackPacker(p);
          if (out && out !== code) return out;
        } catch {}
      }
    }

    const stat = staticPull(code);
    if (stat && stat !== code) return stat;

    const byTrans = captureByTransform(code);
    if (byTrans && byTrans !== code) return byTrans;

    const bySand = captureBySandbox(code);
    if (bySand && bySand !== code) return bySand;

    return null;
  }

  // 8) 递归多轮（最多 15 轮）
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

  // 注册插件：保持对外名称/接口不变
  function detect(code) {
    return (
      code.includes("eval(") ||
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

// 轻量分行（兜底，美化失败也能看）
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

// 统一美化入口（优先 Prettier，其次兜底）
function prettyFormat(code) {
  try {
    if (window.prettier && window.prettierPlugins && window.prettierPlugins.babel) {
      return window.prettier.format(code, {
        parser: "babel",
        plugins: [window.prettierPlugins.babel],
      });
    }
  } catch {}
  return simpleFormat(code);
}

// 暴露到全局
window.DecodePlugins = window.DecodePlugins || {};
window.smartDecodePipeline = smartDecodePipeline;
