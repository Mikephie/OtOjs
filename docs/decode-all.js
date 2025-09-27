// decode-all.js
(function () {
  window.DecodePlugins = window.DecodePlugins || {};

  /**
   * ========== AADecode 插件 ==========
   */
  window.DecodePlugins.aadecode = {
    detect: code => /ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(code),
    plugin: code => {
      try {
        const aaStartIndex = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
        let header = "";
        let encodedPart = code;
        if (aaStartIndex > 0) {
          header = code.substring(0, aaStartIndex).trim();
          encodedPart = code.substring(aaStartIndex);
        }
        // 解码逻辑
        let decodePart = encodedPart.replace(") ('_')", "")
          .replace("(ﾟДﾟ) ['_'] (", "return ");
        const x = new Function(decodePart);
        const decoded = x();
        return header ? header + "\n\n" + decoded : decoded;
      } catch (e) {
        console.error("AADecode 解码失败", e);
        return null;
      }
    }
  };

  /**
   * ========== Eval/Packer 插件 (Dean Edwards) ==========
   */
  function unpackPacker(code) {
    const packerPattern =
      /eval\(function\(p,a,c,k,e,d\)\{.*\}\('(.*)',(\d+),(\d+),'(.*)'\.split\('(.*)'\),(\d+),\{\}\)\)/;
    const match = code.match(packerPattern);
    if (!match) return null;

    const payload = match[1];
    const radix = parseInt(match[2]);
    const count = parseInt(match[3]);
    const words = match[4].split(match[5]);

    function decode(c) {
      c = parseInt(c, radix);
      return (c < radix ? "" : decode(Math.floor(c / radix))) +
        ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    }

    const dictionary = {};
    for (let i = 0; i < count; i++) {
      dictionary[decode(i)] = words[i] || decode(i);
    }

    let unpacked = payload;
    for (let i = count - 1; i >= 0; i--) {
      const key = decode(i);
      if (dictionary[key]) {
        const regex = new RegExp("\\b" + key + "\\b", "g");
        unpacked = unpacked.replace(regex, dictionary[key]);
      }
    }
    return unpacked;
  }

  window.DecodePlugins.evalpack = {
    detect: code => code.includes("eval(") && code.includes("split("),
    plugin: code => {
      try {
        let result = unpackPacker(code);
        if (result && result.includes("eval(")) {
          // 递归继续解
          return window.DecodePlugins.evalpack.plugin(result);
        }
        return result || code;
      } catch (e) {
        console.error("Eval/Packer 解包失败", e);
        return null;
      }
    }
  };

  /**
   * ========== JSFuck 插件 ==========
   */
  window.DecodePlugins.jsfuck = {
    detect: code =>
      code.includes("[][") || code.includes("![]") || code.includes("function(){return"),
    plugin: code => {
      try {
        return eval(code);
      } catch (e) {
        console.error("JSFuck 解码失败", e);
        return null;
      }
    }
  };

  /**
   * ========== 解密调度器 ==========
   */
  window.runDecodeAll = function (code) {
    let processed = code;
    for (const [name, plugin] of Object.entries(window.DecodePlugins)) {
      if (plugin.detect(processed)) {
        console.log(`[decode-all] 尝试插件: ${name}`);
        const result = plugin.plugin(processed);
        if (result && result !== processed) {
          console.log(`[decode-all] ${name} 成功解出`);
          return result; // ✅ 解出立即返回
        }
      }
    }
    return processed;
  };

  console.log("✅ decode-all.js 已加载: AADecode + EvalPacker + JSFuck");
})();
