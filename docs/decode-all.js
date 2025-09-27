/* ========================================================================
 * decode-all.js —— 完整版（前端秒解·加强）
 * 支持：AAdecode / JSFuck / Eval-Packer（含间接 eval、setTimeout、Function 构造器等）
 * 暴露：window.smartDecodePipeline(code), window.runDecodeAll(code)
 * ===================================================================== */

(function () {
  if (typeof window === "undefined") return;
  window.DecodePlugins = window.DecodePlugins || {};
  const Plugins = window.DecodePlugins;

  const LOG = false;
  const log = (...a) => LOG && console.log("[decode-all]", ...a);
  const isStr = (v) => typeof v === "string";

  function decodeEscapes(str) {
    try {
      const json =
        '"' +
        String(str)
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
        return Function('return "' + String(str).replace(/"/g, '\\"') + '"')();
      } catch {
        return str;
      }
    }
  }

  /* ======================= AADecode ======================= */
  Plugins.aadecode = {
    name: "aadecode",
    detect(code) {
      return /ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(code);
    },
    plugin(code) {
      try {
        const idx = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
        let header = "",
          encoded = code;
        if (idx > 0) {
          header = code.slice(0, idx).trim();
          encoded = code.slice(idx);
        }
        let part = encoded
          .replace(") ('_')", "")
          .replace("(ﾟДﾟ) ['_'] (", "return ");
        // eslint-disable-next-line no-new-func
        const out = new Function(part)();
        const finalText = header ? header + "\n\n" + out : out;
        return isStr(finalText) ? finalText : String(finalText);
      } catch (e) {
        log("AADecode 失败：", e);
        return null;
      }
    },
  };

  /* ======================= JSFuck ======================= */
  Plugins.jsfuck = {
    name: "jsfuck",
    detect(code) {
      const s = String(code).replace(/\s+/g, "");
      return (
        s.length > 80 &&
        /^[\[\]\(\)\!\+\-<>=&|{},;:?%/*.^'"`0-9a-zA-Z\s]+$/.test(code) &&
        /(\[\]|\(\)|\!\+|\+\!)/.test(s)
      );
    },
    plugin(code) {
      try {
        // eslint-disable-next-line no-eval
        const out = eval(code);
        return out == null ? null : String(out);
      } catch (e) {
        log("JSFuck 失败：", e);
        return null;
      }
    },
  };

  /* =================== Eval / Packer（加强） =================== */
  (function registerEvalPacker() {
    function looksLikePacker(code) {
      return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/.test(
        code
      );
    }

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

    function unpackPacker(params) {
      const { payload, radix, count, wordsRaw, sep } = params;
      const words = wordsRaw.split(sep);
      function baseN(c) {
        c = parseInt(c, radix);
        return (
          (c < radix ? "" : baseN(Math.floor(c / radix))) +
          ((c = c % radix) > 35
            ? String.fromCharCode(c + 29)
            : c.toString(36))
        );
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
      return decodeEscapes(out);
    }

    /* ---------- 间接 eval 捕获：eval / (0,eval) / window.eval / this['eval'] / Function / setTimeout ---------- */
    function captureBySandbox(code) {
      let captured = null;
      const hookEval = (x) => {
        captured = x;
        return x;
      };
      const hookTimeout = (fn) => {
        if (typeof fn === "string") {
          captured = fn;
        }
        return 0;
      };
      const hookFunction = function (...args) {
        // Function("payload")() 直接抓 payload
        if (args.length === 1 && typeof args[0] === "string") {
          captured = args[0];
          return function () {};
        }
        // 其他形态统一返回空函数
        return function () {};
      };

      const sandbox = {
        eval: hookEval,
        window: { eval: hookEval },
        self: { eval: hookEval },
        globalThis: { eval: hookEval },
        document: {},
        navigator: { userAgent: "Mozilla/5.0" },
        location: {},
        console,
        setTimeout: hookTimeout,
        setInterval: hookTimeout,
        Function: hookFunction,
        // 允许 atob/btoa 兼容
        atob:
          typeof atob !== "undefined"
            ? atob
            : (s) =>
                typeof Buffer !== "undefined"
                  ? Buffer.from(String(s), "base64").toString("binary")
                  : s,
        btoa:
          typeof btoa !== "undefined"
            ? btoa
            : (s) =>
                typeof Buffer !== "undefined"
                  ? Buffer.from(String(s), "binary").toString("base64")
                  : s,
      };

      try {
        // eslint-disable-next-line no-new-func
        Function(
          ...Object.keys(sandbox),
          `"use strict";try{${code}}catch(e){}`
        )(...Object.values(sandbox));
      } catch {}
      return captured;
    }

    function unpackOnce(code) {
      // 1) 标准 packer
      if (looksLikePacker(code)) {
        const p = extractPackerParams(code);
        if (p) {
          try {
            const out = unpackPacker(p);
            if (isStr(out) && out && out !== code) return out;
          } catch (e) {
            log("Packer 回填失败：", e);
          }
        }
      }
      // 2) 间接 eval 捕获（eval / (0,eval) / window['eval'] / this['eval'] / Function("...")() / setTimeout("...")）
      try {
        const cap = captureBySandbox(code);
        if (isStr(cap) && cap && cap !== code) return cap;
      } catch (e) {
        log("间接 eval 捕获失败：", e);
      }
      return null;
    }

    function unwrapRecursive(code, maxDepth = 25) {
      let out = code;
      for (let i = 0; i < maxDepth; i++) {
        // 常见外壳：IIFE + evalpack 放里面
        // 例如：(function(){ eval(function(p,a,c,k,e,d){...}) })();
        const iife = out.match(
          /^\s*\(?\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\)\s*;?\s*\(?\s*\)\s*;?\s*$/
        );
        if (iife && iife[1]) out = iife[1];

        const next = unpackOnce(out);
        if (!next) break;
        if (next !== out) {
          out = String(next);
          continue;
        }
        break;
      }
      return out;
    }

    Plugins.evalpack = {
      name: "evalpack",
      detect(code) {
        return (
          /\beval\s*\(/.test(code) || // 直接 eval
          /\(\s*0\s*,\s*eval\s*\)\s*\(/.test(code) || // (0,eval)(
          /window\s*\[\s*['"]eval['"]\s*\]\s*\(/.test(code) || // window["eval"](
          /this\s*\[\s*['"]eval['"]\s*\]\s*\(/.test(code) || // this["eval"](
          /setTimeout\s*\(\s*['"]/i.test(code) || // setTimeout("payload",
          /setInterval\s*\(\s*['"]/i.test(code) || // setInterval("payload",
          /Function\s*\(\s*['"]/.test(code) || // Function("payload")()
          looksLikePacker(code)
        );
      },
      plugin(code) {
        try {
          const out = unwrapRecursive(code, 25);
          return out && out !== code ? out : null;
        } catch (e) {
          log("Eval/Packer 失败：", e);
          return null;
        }
      },
    };
  })();

  /* =================== 调度（多轮递进） =================== */
  // 顺序：先 AA，再 Eval/Packer（含间接 eval），最后 JSFuck
  const ORDER = ["aadecode", "evalpack", "jsfuck"];

  function smartDecodePipeline(input, maxRounds = 10) {
    let out = String(input),
      changed = true,
      round = 0;
    while (changed && round < maxRounds) {
      changed = false;
      round++;
      for (const name of ORDER) {
        const P = Plugins[name];
        if (!P || typeof P.detect !== "function" || typeof P.plugin !== "function")
          continue;
        if (P.detect(out)) {
          const res = P.plugin(out);
          if (isStr(res) && res && res !== out) {
            out = res;
            changed = true;
            break;
          }
        }
      }
    }
    return out;
  }

  function runDecodeAll(code) {
    let processed = String(code);
    for (const name of ORDER) {
      const P = Plugins[name];
      if (!P || typeof P.detect !== "function" || typeof P.plugin !== "function")
        continue;
      if (P.detect(processed)) {
        const result = P.plugin(processed);
        if (isStr(result) && result && result !== processed) return result;
      }
    }
    return processed;
  }

  window.smartDecodePipeline = smartDecodePipeline;
  window.runDecodeAll = runDecodeAll;
  log("✅ decode-all.js 已加载（AAdecode / JSFuck / Eval-Packer + 间接 eval 捕获）");
})();
