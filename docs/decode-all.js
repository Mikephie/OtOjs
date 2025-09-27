// ========== decode-all.js (加强版：前端秒解插件合集) ==========
// 提供 window.smartDecodePipeline(code)

(function ensureContainer() {
  window.DecodePlugins = window.DecodePlugins || {};
})();

// -------------------------------------------------------------
// 1) AADecode 插件
// -------------------------------------------------------------
(function () {
  function extractHeader(code) {
    const idx = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
    if (idx > 0) {
      return { header: code.slice(0, idx).trim(), encodedPart: code.slice(idx) };
    }
    return { header: "", encodedPart: code };
  }

  function aadDecode(code) {
    try {
      const { header, encodedPart } = extractHeader(code);
      if (
        !(
          encodedPart.includes("ﾟωﾟﾉ") ||
          encodedPart.includes("ﾟДﾟ") ||
          encodedPart.includes("ﾟдﾟ") ||
          encodedPart.includes("ﾟΘﾟ")
        )
      ) {
        return null;
      }
      // 经典解码：把返回值取出来
      let part = encodedPart
        .replace(") ('_')", "")
        .replace("(ﾟДﾟ) ['_'] (", "return ");
      // eslint-disable-next-line no-new-func
      const out = new Function(part)();
      return header ? header + "\n\n" + out : out;
    } catch {
      return null;
    }
  }

  window.DecodePlugins.aadecode = {
    detect: (code) =>
      code.includes("ﾟωﾟﾉ") ||
      code.includes("ﾟДﾟ") ||
      code.includes("ﾟдﾟ") ||
      code.includes("ﾟΘﾟ"),
    plugin: aadDecode,
  };
})();

// -------------------------------------------------------------
// 2) JSFuck 插件
// -------------------------------------------------------------
(function () {
  function looksLikeJSFuck(code) {
    const s = code.replace(/\s+/g, "");
    // 典型 JSFuck 只有 []()+! 等
    return /^[\[\]\(\)\!\+\-<>=&|{},;:?%/*.^'"`0-9a-zA-Z\s]+$/.test(code) &&
           /(\[\]|\(\)|\!\+|\+\!)/.test(s) &&
           s.length > 50;
  }

  function jsfuckDecode(code) {
    try {
      // eslint-disable-next-line no-eval
      return eval(code);
    } catch {
      return null;
    }
  }

  window.DecodePlugins.jsfuck = {
    detect: looksLikeJSFuck,
    plugin: jsfuckDecode,
  };
})();

// -------------------------------------------------------------
// 3) Eval / Dean Edwards Packer 插件（增强：宽容识别 + 递归 + 转义还原 + 备用捕获）
// -------------------------------------------------------------
(function () {
  // —— 把 \xNN / \uXXXX 等转义恢复为正常文本（宽容）——
  function decodeEscapes(str) {
    try {
      const json =
        '"' +
        str
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\r/g, "\\r")
          .replace(/\n/g, "\\n")
          .replace(/\t/g, "\\t")
          .replace(/\f/g, "\\f")
          .replace(/\v/g, "\\v") +
        '"';
      return JSON.parse(json);
    } catch {
      try {
        // eslint-disable-next-line no-new-func
        return Function('return "' + str.replace(/"/g, '\\"') + '"')();
      } catch {
        return str;
      }
    }
  }

  // —— 识别 “eval(function(p,a,c,k,e,d){...})” 结构（宽容空白/引号）——
  function looksLikePacker(code) {
    return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/.test(code);
  }

  // —— 提取 Packer 参数 ——（常见形态）
  function extractPackerParams(code) {
    const re = new RegExp(
      String.raw`eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*([`'"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([`'"])([\s\S]*?)\5\s*\.split\s*\(\s*([`'"])([\s\S]*?)\7\s*\)\s*,\s*(\d+)\s*,\s*\{\s*\}\s*\)\s*\)`,
      "m"
    );
    const m = code.match(re);
    if (!m) return null;
    return {
      payload: m[2],
      radix: parseInt(m[3]),
      count: parseInt(m[4]),
      wordsRaw: m[6],
      sep: m[8],
      countCheck: parseInt(m[9]),
    };
  }

  // —— Packer 解包：字典回填（从 count 到 0）——
  function unpackPacker(params) {
    const { payload, radix, count, wordsRaw, sep } = params;
    const words = wordsRaw.split(sep);

    function baseN(c) {
      c = parseInt(c, radix);
      return (c < radix ? "" : baseN(Math.floor(c / radix))) +
             ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    }

    const dict = Object.create(null);
    for (let i = 0; i < count; i++) {
      const k = baseN(i);
      dict[k] = words[i] || k;
    }

    let out = payload;
    for (let i = count - 1; i >= 0; i--) {
      const k = baseN(i);
      const v = dict[k];
      if (v) out = out.replace(new RegExp(`\\b${k}\\b`, "g"), v);
    }
    return out;
  }

  // —— 备用：用 “eval 捕获器” 取出参数 ——（非 Packer 场景）
  function captureEval(code) {
    let result = null;
    const sandbox = {
      eval: (x) => (result = x),
      String, Number, Boolean, RegExp, Math, Date, Array, Object, JSON, console,
      window: {}, document: {}, navigator: { userAgent: "Mozilla/5.0" }, location: {},
      atob: (s)=> typeof atob!=="undefined" ? atob(s) : (typeof Buffer!=="undefined" ? Buffer.from(String(s),"base64").toString("binary") : s),
      btoa: (s)=> typeof btoa!=="undefined" ? btoa(s) : (typeof Buffer!=="undefined" ? Buffer.from(String(s),"binary").toString("base64") : s),
    };
    try {
      // eslint-disable-next-line no-new-func
      Function(...Object.keys(sandbox), `"use strict";try{${code}}catch{}`)(...Object.values(sandbox));
    } catch {}
    return typeof result === "string" ? result : null;
  }

  // —— 单步尝试：Packer 优先，否则捕获 —— 
  function unpackOnce(code) {
    if (looksLikePacker(code)) {
      const p = extractPackerParams(code);
      if (p) {
        try {
          let out = unpackPacker(p);
          out = decodeEscapes(out);
          return out;
        } catch {}
      }
    }
    try { const x = captureEval(code); if (x) return x; } catch {}
    return null;
  }

  // —— 递归解包：最多 8 层，避免死循环 —— 
  function unpackRecursive(code, maxDepth = 8) {
    let out = code;
    for (let i = 0; i < maxDepth; i++) {
      const next = unpackOnce(out);
      if (!next) break;
      if (next !== out) { out = next; continue; }
      break;
    }
    return out;
  }

  function plugin(code) {
    if (!/\beval\s*\(/.test(code)) return null;
    try {
      const out = unpackRecursive(code, 8);
      return out && out !== code ? out : null;
    } catch { return null; }
  }

  window.DecodePlugins.eval = {
    detect: (code) => /\beval\s*\(/.test(code),
    plugin,
  };
})();

// -------------------------------------------------------------
// 4) 智能调度：循环跑插件直到不再变化（最多 10 轮）
// -------------------------------------------------------------
window.smartDecodePipeline = function smartDecodePipeline(code) {
  let out = code;
  let changed = true;
  let depth = 0;
  const order = ["aadecode", "jsfuck", "eval"]; // 顺序可调

  while (changed && depth < 10) {
    changed = false;
    for (const key of order) {
      const P = window.DecodePlugins[key];
      if (P && P.detect(out)) {
        const res = P.plugin(out);
        if (typeof res === "string" && res && res !== out) {
          out = res;
          changed = true;
        }
      }
    }
    depth++;
  }
  return out;
};
