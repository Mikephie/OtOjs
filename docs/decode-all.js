/* ========================================================================
 * decode-all.js —— 完整版（前端秒解合集）
 * 支持：AAdecode / JSFuck / Eval-Packer（Dean Edwards）
 * 暴露：window.smartDecodePipeline(code), window.runDecodeAll(code)
 * ===================================================================== */

(function bootstrap() {
  if (typeof window === "undefined") return;
  window.DecodePlugins = window.DecodePlugins || {};
  const Plugins = window.DecodePlugins;

  const LOG_ON = false;
  const log = (...args) => LOG_ON && console.log("[decode-all]", ...args);

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
  const isStr = (v) => typeof v === "string";

  // ---------------- AADecode ----------------
  Plugins.aadecode = {
    name: "aadecode",
    detect(code) { return /ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(code); },
    plugin(code) {
      try {
        const idx = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
        let header = "", encoded = code;
        if (idx > 0) { header = code.slice(0, idx).trim(); encoded = code.slice(idx); }
        let part = encoded.replace(") ('_')", "").replace("(ﾟДﾟ) ['_'] (", "return ");
        // eslint-disable-next-line no-new-func
        const out = new Function(part)();
        const finalText = header ? header + "\n\n" + out : out;
        return isStr(finalText) ? finalText : String(finalText);
      } catch (e) { log("AADecode 失败：", e); return null; }
    },
  };

  // ---------------- JSFuck ----------------
  Plugins.jsfuck = {
    name: "jsfuck",
    detect(code) {
      const s = String(code).replace(/\s+/g, "");
      // 更严格：避免误判，把纯标点长度与组合做限制
      return s.length > 80 && /^[\[\]\(\)\!\+\-<>=&|{},;:?%/*.^'"`0-9a-zA-Z\s]+$/.test(code) && /($begin:math:display$$end:math:display$|$begin:math:text$$end:math:text$|\!\+|\+\!)/.test(s);
    },
    plugin(code) {
      try { /* eslint-disable no-eval */ const out = eval(code); /* eslint-enable */
        return out == null ? null : String(out);
      } catch (e) { log("JSFuck 失败：", e); return null; }
    },
  };

  // ------------- Eval / Dean Edwards Packer -------------
  (function registerEvalPacker() {
    function looksLikePacker(code) {
      return /eval\s*$begin:math:text$\\s*function\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*d\\s*$end:math:text$\s*\{/.test(code);
    }
    function extractPackerParams(code) {
      // 宽容版本（允许各种引号/空白）
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
        return (c < radix ? "" : baseN(Math.floor(c / radix))) + ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
      }
      const dict = Object.create(null);
      for (let i = 0; i < count; i++) {
        const k = baseN(i); dict[k] = words[i] || k;
      }
      let out = payload;
      for (let i = count - 1; i >= 0; i--) {
        const k = baseN(i), v = dict[k];
        if (v) out = out.replace(new RegExp(`\\b${k}\\b`, "g"), v);
      }
      return decodeEscapes(out);
    }
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
      return isStr(result) ? result : null;
    }
    function unpackOnce(code) {
      if (looksLikePacker(code)) {
        const p = extractPackerParams(code);
        if (p) { try { const out = unpackPacker(p); if (isStr(out) && out && out !== code) return out; } catch (e) { log("Packer 回填失败：", e); } }
      }
      try { const cap = captureEval(code); if (isStr(cap) && cap && cap !== code) return cap; } catch (e) { log("捕获 eval 失败：", e); }
      return null;
    }
    function unwrapRecursive(code, maxDepth = 20) {
      let out = code;
      for (let i = 0; i < maxDepth; i++) {
        const next = unpackOnce(out);
        if (!next) break;
        if (next !== out) { out = String(next); continue; }
        break;
      }
      return out;
    }
    Plugins.evalpack = {
      name: "evalpack",
      detect(code) { return /\beval\s*\(/.test(code); },
      plugin(code) {
        try { const out = unwrapRecursive(code, 20); return out && out !== code ? out : null; }
        catch (e) { log("Eval/Packer 失败：", e); return null; }
      },
    };
  })();

  // ---------------- 调度器（严格顺序；多轮） ----------------
  const ORDER = ["aadecode", "evalpack", "jsfuck"];

  function smartDecodePipeline(input, maxRounds = 10) {
    let out = String(input), changed = true, round = 0;
    while (changed && round < maxRounds) {
      changed = false; round++;
      for (const name of ORDER) {
        const P = Plugins[name];
        if (!P || typeof P.detect !== "function" || typeof P.plugin !== "function") continue;
        if (P.detect(out)) {
          const res = P.plugin(out);
          if (isStr(res) && res && res !== out) { out = res; changed = true; break; }
        }
      }
    }
    return out;
  }
  function runDecodeAll(code) {
    let processed = String(code);
    for (const name of ORDER) {
      const P = Plugins[name];
      if (!P || typeof P.detect !== "function" || typeof P.plugin !== "function") continue;
      if (P.detect(processed)) {
        const result = P.plugin(processed);
        if (isStr(result) && result && result !== processed) return result;
      }
    }
    return processed;
  }

  window.smartDecodePipeline = smartDecodePipeline;
  window.runDecodeAll = runDecodeAll;
  log("✅ decode-all.js 已加载：AAdecode / JSFuck / Eval-Packer（前端秒解）");
})();