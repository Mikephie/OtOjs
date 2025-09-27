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
  function unpackDeanEdwardsPacker(code) {
    const packerPattern = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\s*\.split\s*\(\s*'([^']+)'\s*\)\s*,\s*(\d+)\s*,\s*\{\s*\}\s*\)\s*\)/;
    const match = code.match(packerPattern);
    if (!match) return null;
    return {
      payload: match[1],
      radix: parseInt(match[2]),
      count: parseInt(match[3]),
      words: match[4].split(match[5]),
      countCheck: parseInt(match[6])
    };
  }
  function executeDeanEdwardsUnpacker(params) {
    const { payload, radix, count, words } = params;
    const decode = function (c) {
      c = parseInt(c, radix);
      return (c < radix ? '' : decode(Math.floor(c / radix))) +
        ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    };
    const dictionary = {};
    for (let i = 0; i < count; i++) {
      const key = decode(i);
      dictionary[key] = words[i] || key;
    }
    let unpacked = payload;
    for (let i = count - 1; i >= 0; i--) {
      const key = decode(i);
      if (dictionary[key]) {
        const regex = new RegExp('\\b' + key + '\\b', 'g');
        unpacked = unpacked.replace(regex, dictionary[key]);
      }
    }
    return unpacked;
  }
  function unpack(code) {
    if (!code.includes("eval")) return null;
    // 1) 先尝试 Packer
    const packerParams = unpackDeanEdwardsPacker(code);
    if (packerParams) {
      try {
        let result = executeDeanEdwardsUnpacker(packerParams);
        if (result && result.includes("eval")) result = unpack(result);
        return result;
      } catch { /* 继续尝试其他方法 */ }
    }
    // 2) Function 替换法（捕获 eval 参数）
    try {
      let result = null;
      const modifiedCode = code.replace(/\beval\b/g, '(function(x){result=x;return x;})');
      const func = new Function('result', `
        let result=null;
        ${modifiedCode}
        return result;
      `);
      result = func(null);
      if (typeof result === "string" && result.includes("eval")) return unpack(result);
      return result;
    } catch { }
    return null;
  }
  window.DecodePlugins.eval = {
    detect: code => code.includes("eval("),
    plugin: unpack
  };
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
