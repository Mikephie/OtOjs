/* ========================================================================
 * decode-all.js —— 完整版（前端秒解·超强）
 * 支持：AAdecode / JSFuck / Eval-Packer（含各种间接 eval）/ atob / fromCharCode /
 *       文本数组 join / document.write 注入 等常见变体
 * 暴露：window.smartDecodePipeline(code), window.runDecodeAll(code)
 * ===================================================================== */

(function () {
  if (typeof window === "undefined") return;
  window.DecodePlugins = window.DecodePlugins || {};
  const Plugins = window.DecodePlugins;

  const LOG = false;
  const log = (...a) => LOG && console.log("[decode-all]", ...a);
  const isStr = (v) => typeof v === "string";
  const toStr = (x) => (x == null ? "" : String(x));

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
        return String(str);
      }
    }
  }

  function tryDecodeHexEscapes(s) {
    try {
      // \xNN 与 \uNNNN 统一还原
      return s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
              .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    } catch { return s; }
  }

  function tryFromCharCodeCall(s) {
    // 还原 String.fromCharCode(…)
    // 也支持 new Function("return String.fromCharCode(...);")()
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
    // 还原 ['a','b','c'].join('') / [97,98].map(ch=>String.fromCharCode(ch)).join('')
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
      // 常见 fromCharCode map 组合
      const re2 = /\[\s*([^\]]+?)\s*\]\s*\.map\(\s*[^)]*String\.fromCharCode[^)]*\)\s*\.join\(\s*(['"])\s*\2\s*\)/g;
      out = out.replace(re2, (_, list) => {
        try {
          const arr = Function(`return [${list}]`)();
          if (Array.isArray(arr)) {
            const str = arr.map((n)=>String.fromCharCode(Number(n)||0)).join("");
            return str;
          }
        } catch {}
        return _;
      });
      return out === s ? s : out;
    } catch { return s; }
  }

  function tryAtobEval(s) {
    // eval(atob('...')) / atob("...") 独立
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
    // (function(){ ... })();  或  !function(){...}();
    const m = code.match(/^\s*[!+~\-]?\s*\(?\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\)\s*;?\s*\(?\s*\)\s*;?\s*$/)
             || code.match(/^\s*!\s*function\s*\([^)]*\)\s*\{\s*([\s\S]*)\}\s*\(\s*\)\s*;?\s*$/);
    if (m && m[1]) return m[1];
    return code;
  }

  /* ======================= AADecode ======================= */
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
      return decodeEscapes(out);
    }

    /* ---------- 快速静态提取：eval("...") / setTimeout("...") / Function("...") ---------- */
    function staticPullPayload(code) {
      // 预处理：atob、fromCharCode、数组 join、转义等
      let pre = code;
      pre = tryAtobEval(pre);
      pre = tryFromCharCodeCall(pre);
      pre = tryArrayJoinBuild(pre);
      pre = tryDecodeHexEscapes(pre);

      // eval("...") 参数
      const reEval = /\beval\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/;
      const m1 = pre.match(reEval);
      if (m1) return m1[2];

      // (0,eval)("...") / window['eval']("...") / this["eval"]("...")
      const reIE = /\(\s*0\s*,\s*eval\s*\)\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/
                 || /(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/;
      const m2 = pre.match(/\(\s*0\s*,\s*eval\s*\)\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
      if (m2) return m2[2];

      const m3 = pre.match(/(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(\s*([`'"])([\s\S]*?)\1\s*\)/);
      if (m3) return m3[2];

      // setTimeout("payload", ...) / setInterval("payload", ...)
      const m4 = pre.match(/set(?:Timeout|Interval)\s*\(\s*([`'"])([\s\S]*?)\1\s*,/i);
      if (m4) return m4[2];

      // Function("payload")() / new Function("payload")()
      const m5 = pre.match(/\bnew?\s*Function\s*\(\s*([`'"])([\s\S]*?)\1\s*\)\s*\(\s*\)/i);
      if (m5) return m5[2];

      // document.write("<script>...") 抓脚本文本
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

    /* ---------- 替换钩子执行（把所有 eval/Function/setTimeout 都换成捕获） ---------- */
    function captureByTransform(code) {
      let captured = null;
      const setter = `__CAP__ = (x)=>{__PAYLOAD__ = x;return x;}`;
      const safe = (s) => s.replace(/\$/g, "$$$$");

      // 统一替换常见调用为 setter
      const replaced = code
        // eval(...)
        .replace(/\beval\s*\(/g, "(__CAP__)(")
        // (0,eval)(...)
        .replace(/\(\s*0\s*,\s*eval\s*\)\s*\(/g, "(__CAP__)(")
        // window['eval'](...), this["eval"](...)
        .replace(/(?:window|this|self|globalThis)\s*\[\s*['"]eval['"]\s*\]\s*\(/g, "(__CAP__)(")
        // setTimeout("payload",...)/setInterval
        .replace(/set(?:Timeout|Interval)\s*\(\s*([`'"])([\s\S]*?)\1\s*,/gi, (m, q, body) => `(__CAP__)(${JSON.stringify(body)}),`)
        // Function("payload")()
        .replace(/\bnew?\s*Function\s*\(\s*([`'"])([\s\S]*?)\1\s*\)\s*\(\s*\)/gi, (m, q, body) => `(__CAP__)(${JSON.stringify(body)})`)
        ;

      const runner = `
        "use strict";
        var __PAYLOAD__=null; var __CAP__=null;
        ${setter}
        try{ ${replaced} }catch(e){}
        return __PAYLOAD__;
      `;

      try {
        // eslint-disable-next-line no-new-func
        const res = Function(runner)();
        captured = res;
      } catch {}
      return captured;
    }

    /* ---------- 沙箱执行捕获（最后兜底） ---------- */
    function captureBySandbox(code) {
      let captured = null;
      const hookEval = (x) => (captured = x);
      const hookTimeout = (fn) => { if (typeof fn === "string") captured = fn; return 0; };
      const hookFunction = function (...args) {
        if (args.length === 1 && typeof args[0] === "string") { captured = args[0]; return function () {}; }
        return function () {};
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

      try {
        // eslint-disable-next-line no-new-func
        Function(...Object.keys(sandbox), `"use strict";try{${code}}catch(e){}`)(...Object.values(sandbox));
      } catch {}
      return captured;
    }

    function unpackOnce(input) {
      let code = input;

      // 去壳：IIFE
      code = stripIIFEOnce(code);

      // Dean Edwards packer
      if (looksLikePacker(code)) {
        const p = extractPackerParams(code);
        if (p) {
          try {
            const out = unpackPacker(p);
            if (isStr(out) && out && out !== code) return out;
          } catch (e) { log("Packer 回填失败：", e); }
        }
      }

      // 先来一轮静态提取
      const stat = staticPullPayload(code);
      if (isStr(stat) && stat && stat !== code) return stat;

      // 再试替换钩子
      const byTrans = captureByTransform(code);
      if (isStr(byTrans) && byTrans && byTrans !== code) return byTrans;

      // 最后沙箱执行
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
  })();

  /* =================== 调度（多轮递进） =================== */
  // 顺序：先 AA，再 Eval/Packer（含间接 eval），最后 JSFuck
  const ORDER = ["aadecode", "evalpack", "jsfuck"];

  function smartDecodePipeline(input, maxRounds = 15) {
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
})();
