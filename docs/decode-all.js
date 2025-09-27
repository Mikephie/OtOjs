/* ========================================================================
 * decode-all.js  ——  完整版（前端秒解合集）
 * 支持：AAdecode / JSFuck / Eval-Packer（Dean Edwards）
 * 暴露：window.smartDecodePipeline(code), window.runDecodeAll(code)
 * 说明：纯前端实现，递归解包，多插件串联；解出立即返回；保留头注释。
 * ===================================================================== */

(function bootstrap() {
  /* 容器 */
  if (typeof window === "undefined") return;
  window.DecodePlugins = window.DecodePlugins || {};
  const Plugins = window.DecodePlugins;

  /* 小工具：安全日志（可按需关闭） */
  const LOG_ON = false;
  const log = (...args) => LOG_ON && console.log("[decode-all]", ...args);

  /* 工具：宽容转义还原（\xNN / \uXXXX 等） */
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

  /* 工具：是否字符串 */
  const isStr = (v) => typeof v === "string";

  /* =====================================================================
   * 1) AADecode 插件（恢复头注释 + 立即返回）
   * =================================================================== */
  Plugins.aadecode = {
    name: "aadecode",
    detect(code) {
      // 直接检测常见的 aadecode 特征
      return /ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(code);
    },
    plugin(code) {
      try {
        // 分离头注释（若有）
        const idx = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
        let header = "";
        let encoded = code;
        if (idx > 0) {
          header = code.slice(0, idx).trim();
          encoded = code.slice(idx);
        }

        // 经典最小替换（把返回值拿出来）
        let part = encoded
          .replace(") ('_')", "")
          .replace("(ﾟДﾟ) ['_'] (", "return ");

        // eslint-disable-next-line no-new-func
        const out = new Function(part)();
        const finalText = header ? header + "\n\n" + out : out;

        // 若还包含可再解的特征，可交由外层递归（不在此递归）
        return isStr(finalText) ? finalText : String(finalText);
      } catch (e) {
        log("AADecode 失败：", e);
        return null;
      }
    },
  };

  /* =====================================================================
   * 2) JSFuck 插件（直接 eval）
   * =================================================================== */
  Plugins.jsfuck = {
    name: "jsfuck",
    detect(code) {
      // 宽松：只要存在这类模式即可尝试；长度限制避免误判
      const s = String(code).replace(/\s+/g, "");
      return (
        s.length > 50 &&
        /[\[\]\(\)\!\+]{4,}/.test(s) &&
        (s.includes("[]") || s.includes("![]") || s.includes("(![])"))
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

  /* =====================================================================
   * 3) Eval / Dean Edwards Packer 插件（纯前端；递归；宽容识别）
   * =================================================================== */
  (function registerEvalPacker() {
    function looksLikePacker(code) {
      return /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{/.test(
        code
      );
    }

    // 提取参数（对引号/空白宽容）
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

    // 核心解包：从 count 到 0 的字典回填
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

    // 备用：捕获 eval 参数（不执行真实 payload）
    function captureEval(code) {
      let result = null;
      const sandbox = {
        eval: (x) => (result = x),
        String,
        Number,
        Boolean,
        RegExp,
        Math,
        Date,
        Array,
        Object,
        JSON,
        console,
        window: {},
        document: {},
        navigator: { userAgent: "Mozilla/5.0" },
        location: {},
        atob: (s) =>
          typeof atob !== "undefined"
            ? atob(s)
            : typeof Buffer !== "undefined"
            ? Buffer.from(String(s), "base64").toString("binary")
            : s,
        btoa: (s) =>
          typeof btoa !== "undefined"
            ? btoa(s)
            : typeof Buffer !== "undefined"
            ? Buffer.from(String(s), "binary").toString("base64")
            : s,
      };
      try {
        // eslint-disable-next-line no-new-func
        Function(
          ...Object.keys(sandbox),
          `"use strict";try{${code}}catch{}`
        )(...Object.values(sandbox));
      } catch {}
      return isStr(result) ? result : null;
    }

    function unpackOnce(code) {
      // 先尝试标准 Packer
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
      // 再尝试捕获 eval 参数
      try {
        const cap = captureEval(code);
        if (isStr(cap) && cap && cap !== code) return cap;
      } catch (e) {
        log("捕获 eval 失败：", e);
      }
      return null;
    }

    function unwrapRecursive(code, maxDepth = 20) {
      let out = code;
      for (let i = 0; i < maxDepth; i++) {
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
        // 只要出现 eval( 就尝试；优先由 aadecode/jsfuck 先跑
        return /\beval\s*\(/.test(code);
      },
      plugin(code) {
        try {
          const out = unwrapRecursive(code, 20);
          return out && out !== code ? out : null;
        } catch (e) {
          log("Eval/Packer 失败：", e);
          return null;
        }
      },
    };
  })();

  /* =====================================================================
   * 统一调度（严格顺序；解出立即返回；最多 10 轮递进）
   * =================================================================== */
  const ORDER = ["aadecode", "jsfuck", "evalpack"];

  function smartDecodePipeline(input, maxRounds = 10) {
    let out = String(input);
    let changed = true;
    let round = 0;

    while (changed && round < maxRounds) {
      changed = false;
      round++;

      for (const name of ORDER) {
        const P = Plugins[name];
        if (!P || typeof P.detect !== "function" || typeof P.plugin !== "function")
          continue;

        if (P.detect(out)) {
          log(`尝试插件: ${name}`);
          const res = P.plugin(out);
          if (isStr(res) && res && res !== out) {
            log(`${name} 成功，进入下一轮`);
            out = res;
            changed = true;
            break; // 本轮已变化，进入下一轮
          }
        }
      }
    }
    return out;
  }

  function runDecodeAll(code) {
    // 单轮顺序尝试（解出立即返回）
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

  // 对外暴露（与现有调用保持兼容）
  window.smartDecodePipeline = smartDecodePipeline;
  window.runDecodeAll = runDecodeAll;

  log("✅ decode-all.js 已加载：AAdecode / JSFuck / Eval-Packer（前端秒解）");
})();
