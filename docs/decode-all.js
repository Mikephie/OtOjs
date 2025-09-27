// ========== decode-all.js (完整版) ==========

// ---- 全局插件容器 ----
window.DecodePlugins = window.DecodePlugins || {};

// =====================================================
// 1. AADecode 插件
// =====================================================
(function () {
  function detectAADecode(code) {
    return /ﾟωﾟﾉ=/.test(code) || /\/\*_+ε\+/.test(code);
  }

  function aadDecode(code) {
    try {
      // AADecode 经典实现
      // eslint-disable-next-line no-eval
      return eval(code + ";") || null;
    } catch {
      return null;
    }
  }

  window.DecodePlugins.aadecode = {
    detect: detectAADecode,
    plugin: (code) => (detectAADecode(code) ? aadDecode(code) : null),
  };
})();

// =====================================================
// 2. JSFuck 插件
// =====================================================
(function () {
  function detectJSFuck(code) {
    return (
      /^[\[\]!\+\(\)]+$/.test(code.replace(/\s+/g, "")) &&
      code.length > 50
    );
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
    detect: detectJSFuck,
    plugin: (code) => (detectJSFuck(code) ? jsfuckDecode(code) : null),
  };
})();

// =====================================================
// 3. Eval + Dean Edwards Packer 插件（增强版）
// =====================================================
(function () {
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
        return Function('return "' + str.replace(/"/g, '\\"') + '"')();
      } catch {
        return str;
      }
    }
  }

  function looksLikePacker(code) {
    return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/.test(
      code
    );
  }

  function extractPackerParams(code) {
    const re =
      /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*([`'"])([\s\S]*?)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([`'"])([\s\S]*?)\5\s*\.split\s*\(\s*([`'"])([\s\S]*?)\7\s*\)\s*,\s*(\d+)\s*,\s*\{\s*\}\s*\)\s*\)/;
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

  function unpackPacker(params) {
    const { payload, radix, count, wordsRaw, sep } = params;
    const words = wordsRaw.split(sep);

    function baseN(c) {
      c = parseInt(c, radix);
      return (c < radix ? "" : baseN(Math.floor(c / radix))) +
        ((c = c % radix) > 35
          ? String.fromCharCode(c + 29)
          : c.toString(36));
    }

    const dict = Object.create(null);
    for (let i = 0; i < count; i++) {
      const key = baseN(i);
      dict[key] = words[i] || key;
    }

    let out = payload;
    for (let i = count - 1; i >= 0; i--) {
      const key = baseN(i);
      const val = dict[key];
      if (val) {
        const re = new RegExp("\\b" + key + "\\b", "g");
        out = out.replace(re, val);
      }
    }
    return out;
  }

  function captureEval(code) {
    let result = null;
    const sandbox = {
      eval: function (x) {
        result = x;
        return x;
      },
      String,
      Number,
      Boolean,
      RegExp,
      Math,
      Date,
      Array,
      Object,
      JSON,
      window: {},
      document: {},
      navigator: { userAgent: "Mozilla/5.0" },
      location: {},
      global: {},
      atob: (s) =>
        typeof atob !== "undefined"
          ? atob(s)
          : Buffer.from(String(s), "base64").toString("binary"),
      btoa: (s) =>
        typeof btoa !== "undefined"
          ? btoa(s)
          : Buffer.from(String(s), "binary").toString("base64"),
      console,
    };

    try {
      Function(
        ...Object.keys(sandbox),
        `"use strict";try { ${code} } catch (e) {}`
      )(...Object.values(sandbox));
    } catch {}
    return typeof result === "string" || typeof result === "function"
      ? String(result)
      : null;
  }

  function unpackOnce(code) {
    if (looksLikePacker(code)) {
      const p = extractPackerParams(code);
      if (p) {
        try {
          let out = unpackPacker(p);
          out = decodeEscapes(out);
          return out;
        } catch (e) {
          console.warn("[packer] 回填失败", e);
        }
      }
    }
    try {
      const x = captureEval(code);
      if (x) return x;
    } catch {}
    return null;
  }

  function unpackRecursive(code, maxDepth = 8) {
    let out = code;
    for (let i = 0; i < maxDepth; i++) {
      const nxt = unpackOnce(out);
      if (!nxt) break;
      if (typeof nxt === "string" && nxt !== out) {
        out = nxt;
        continue;
      }
      break;
    }
    return out;
  }

  function plugin(code) {
    if (!/\beval\s*\(/.test(code)) return null;
    try {
      let out = unpackRecursive(code, 8);
      if (out && out !== code) return out;
      return null;
    } catch (e) {
      console.error("[eval] 解包出错", e);
      return null;
    }
  }

  window.DecodePlugins.eval = {
    detect: (code) => /\beval\s*\(/.test(code),
    plugin,
  };
})();

// =====================================================
// 4. 主调度函数：依次调用插件直到不再变化
// =====================================================
function smartDecodePipeline(code) {
  let out = code;
  let changed = true;
  let depth = 0;
  while (changed && depth < 10) {
    changed = false;
    for (const key of ["aadecode", "jsfuck", "eval"]) {
      const plugin = window.DecodePlugins[key];
      if (plugin && plugin.detect(out)) {
        const res = plugin.plugin(out);
        if (res && res !== out) {
          out = res;
          changed = true;
        }
      }
    }
    depth++;
  }
  return out;
}

// 导出供 app.js 使用
window.smartDecodePipeline = smartDecodePipeline;
