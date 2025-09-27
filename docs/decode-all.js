/* ========================================================================
 * decode-all.js —— OtOjs 前端解密插件总汇（完整版）
 * 集成：AAEncode / Eval+Packer（含间接 eval）/ JSFuck
 * 调度：smartDecodePipeline 按 [aadecode → evalpack → jsfuck] 多轮递进
 * ===================================================================== */

(function () {
  if (typeof window === "undefined") return;
  window.DecodePlugins = window.DecodePlugins || {};
  const Plugins = window.DecodePlugins;

  const LOG = false;
  const log = (...a) => LOG && console.log("[decode-all]", ...a);
  const isStr = (v) => typeof v === "string";
  const toStr = (x) => (x == null ? "" : String(x));

  function tryDecodeHexEscapes(s) {
    try {
      return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
              .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    } catch { return s; }
  }
  function tryFromCharCodeCall(s) {
    const re = /String\.fromCharCode\s*\(\s*([^\)]+?)\s*\)/g;
    let out = s, changed = false;
    out = out.replace(re, (_, list) => {
      try {
        const arr = Function(`return [${list}]`)();
        if (Array.isArray(arr)) {
          changed = true;
          return arr.map((n)=>String.fromCharCode(Number(n)||0)).join("");
        }
      } catch {}
      return _;
    });
    return changed ? out : s;
  }
  function tryArrayJoinBuild(s) {
    try {
      const re = /\[\s*([^\]]+?)\s*\]\s*\.join\(\s*(['"])\s*\2\s*\)/g;
      let out = s, changed = false;
      out = out.replace(re, (_, list) => {
        try {
          const arr = Function(`return [${list}]`)();
          if (Array.isArray(arr)) {
            changed = true;
            return arr.join("");
          }
        } catch {}
        return _;
      });
      const re2 = /\[\s*([^\]]+?)\s*\]\s*\.map\(\s*[^)]*String\.fromCharCode[^)]*\)\s*\.join\(\s*(['"])\s*\2\s*\)/g;
      out = out.replace(re2, (_, list) => {
        try {
          const arr = Function(`return [${list}]`)();
          if (Array.isArray(arr)) {
            return arr.map((n)=>String.fromCharCode(Number(n)||0)).join("");
          }
        } catch {}
        return _;
      });
      return out === s ? s : out;
    } catch { return s; }
  }
  function tryAtobEval(s) {
    try {
      const re = /atob\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/g;
      let out = s, changed = false;
      out = out.replace(re, (_, q, b64) => {
        try {
          const bin = typeof atob !== "undefined"
            ? atob(b64)
            : (typeof Buffer !== "undefined" ? Buffer.from(String(b64), "base64").toString("binary") : b64);
          changed = true;
          return JSON.stringify(bin);
        } catch {}
        return _;
      });
      return changed ? out : s;
    } catch { return s; }
  }
  function stripIIFEOnce(code) {
    const m = code.match(/^\s*[!+~\-]?\s*\(?\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\)\s*;?\s*\(?\s*\)\s*;?\s*$/)
             || code.match(/^\s*!\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\(\s*\)\s*;?\s*$/);
    if (m && m[1]) return m[1];
    return code;
  }

  /* ======================= AADecode（宽松正则 + 兜底） ======================= */
  Plugins.aadecode = {
    name: "aadecode",
    detect(code) { return /ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(code); },
    plugin(code) {
      try {
        const start = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
        let header = "", encoded = code;
        if (start > 0) { header = code.slice(0, start).trim(); encoded = code.slice(start); }
        let part = encoded
          .replace(/\(\s*ﾟДﾟ\s*\)\s*\[\s*['"]_['"]\s*\]\s*\(/g, "return ")
          .replace(/\)\s*\(\s*['"]_['"]\s*\)/g, ")");

        try {
          const out1 = new Function(part)();
          if (isStr(out1)) return header ? header + "\n\n" + out1 : out1;
        } catch {}
        try {
          const part2 = part.replace(/\beval\s*\(/g, "return (");
          const out2 = new Function(part2)();
          if (isStr(out2)) return header ? header + "\n\n" + out2 : out2;
        } catch {}
        let captured = null;
        const sandbox = {
          alert: (s)=>{ captured = toStr(s); },
          document: { write: (s)=>{ const h=toStr(s); const m=h.match(/<script[^>]*>([\s\S]*?)<\/script>/i); captured = m?m[1]:h; } },
          console, window:{}, self:{}, globalThis:{}
        };
        try { Function(...Object.keys(sandbox), `"use strict";try{${part}}catch(e){}`)(...Object.values(sandbox)); } catch {}
        if (isStr(captured) && captured) return header ? header + "\n\n" + captured : captured;
        return null;
      } catch (e) { log("AADecode 失败：", e); return null; }
    },
  };

  /* =================== Eval / Packer（超强） =================== */
  (function registerEvalPacker() {
    function looksLikePacker(code) {
      return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/.test(code);
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
      return out;
    }

    function staticPullPayload(code) {
      let pre = code;
      pre = tryAtobEval(pre);
      pre = tryFromCharCodeCall(pre);
      pre = tryArrayJoinBuild(pre);
      pre = tryDecodeHexEscapes(pre);
      const reEval = /\beval\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/;
      const m1 = pre.match(reEval); if (m1) return m1[2];
      const m2 = pre.match(/\(\s*0\s*,\s*eval\s*\)\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/); if (m2) return m2[2];
      const m3 = pre.match(/(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/); if (m3) return m3[2];
      const m4 = pre.match(/set(?:Timeout|Interval)\s*\(\s*([`'"])([\s\S]*?)\1\s*,/i); if (m4) return m4[2];
      const m5 = pre.match(/\bnew?\s*Function\s*\(\s*([`'"])([\s\S]*?)\1\s*\)\s*\(\s*\)/i); if (m5) return m5[2];
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

    function captureByTransform(code) {
      const replaced = code
        .replace(/\beval\s*\(/g, "(__CAP__)(")
        .replace(/\(\s*0\s*,\s*eval\s*\)\s*\(/g, "(__CAP__)(")
        .replace(/(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(/g, "(__CAP__)(")
        .replace(/set(?:Timeout|Interval)\s*\(\s*([`'"])([\s\S]*?)\1\s*,/gi, (m, q, body) => `(__CAP__)(${JSON.stringify(body)}),`)
        .replace(/\bnew?\s*Function\s*\(\s*([`'"])([\s\S]*?)\1\s*\)\s*\(\s*\)/gi, (m, q, body) => `(__CAP__)(${JSON.stringify(body)})`);
      const runner = `
        "use strict";
        var __PAYLOAD__=null; var __CAP__ = (x)=>{ __PAYLOAD__ = x; return x; };
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
      const hookWrite = (s) => { lastWrite = toStr(s); const m=lastWrite.match(/<script[^>]*>([\s\S]*?)<\/script>/i); if(m) captured=m[1]; };
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
      let code = input;

      code = stripIIFEOnce(code);

      if (looksLikePacker(code)) {
        const p = extractPackerParams(code);
        if (p) {
          try {
            const out = unpackPacker(p);
            if (isStr(out) && out && out !== code) return out;
          } catch (e) { log("Packer 回填失败：", e); }
        }
      }

      const stat = staticPullPayload(code);
      if (isStr(stat) && stat && stat !== code) return stat;

      const byTrans = captureByTransform(code);
      if (isStr(byTrans) && byTrans && byTrans !== code) return byTrans;

      const bySand = captureBySandbox(code);
      if (isStr(bySand) && bySand && bySand !== code) return bySand;

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
        } catch (e) {
          log("Eval/Packer 失败：", e);
          return null;
        }
      },
    };

    // 兼容你原来使用的 window.DecodePlugins.eval 命名
    Plugins.eval = Plugins.evalpack;
  })();

  /* ======================= JSFuck ======================= */
  Plugins.jsfuck = {
    name: "jsfuck",
    detect(code) {
      const s = String(code).replace(/\s+/g, "");
      return s.length > 80 && /^[\[\]\(\)\!\+\-<>=&|{},;:?%/*.^'"`0-9a-zA-Z\s]+$/.test(code) && /(\[\]|\(\)|\!\+|\+\!)/.test(s);
    },
    plugin(code) {
      try { /* eslint-disable no-eval */ const out = eval(code); /* eslint-enable */
        return out == null ? null : String(out);
      } catch (e) { log("JSFuck 失败：", e); return null; }
    },
  };

  /* =================== 调度（多轮递进，固定顺序） =================== */
  const ORDER = ["aadecode", "evalpack", "jsfuck"];
  async function smartDecodePipeline(input, maxRounds = 15) {
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

  window.smartDecodePipeline = smartDecodePipeline;
})();
