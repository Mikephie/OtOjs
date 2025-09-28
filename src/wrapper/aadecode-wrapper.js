/**
 * AADecode 插件包装器 - 前端版本
 * 保留头部注释，失败返回 null
 */
(function () {
  const module = { exports: {} };

  // ====== AADecode 原始逻辑 ======
  function extractHeader(code) {
    const idx = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
    if (idx > 0) {
      return { header: code.substring(0, idx).trim(), encodedPart: code.substring(idx) };
    }
    return { header: "", encodedPart: code };
  }

  function plugin(code) {
    try {
      const { header, encodedPart } = extractHeader(code);
      if (!(/ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(encodedPart))) return null;

      let decodePart = encodedPart
        .replace(") ('_')", "")
        .replace("(ﾟДﾟ) ['_'] (", "return ");

      const fn = new Function(decodePart);
      const decoded = fn();

      if (typeof decoded !== "string") return null;
      return header ? `${header}\n\n${decoded}` : decoded;
    } catch (e) {
      console.error("[AADecode] 解码错误:", e);
      return null;
    }
  }

  module.exports = plugin;
  // ====== END ======

  window.DecodePlugins = window.DecodePlugins || {};
  window.DecodePlugins.aadecode = {
    detect: (code) => /ﾟωﾟﾉ|ﾟДﾟ|ﾟдﾟ|ﾟΘﾟ/.test(code),
    plugin: (code) => {
      try {
        const result = module.exports(code);
        return result !== null ? result : null;
      } catch (e) {
        console.error("[AADecode] 插件调用失败:", e);
        return null;
      }
    },
  };

  console.log("✅ AADecode wrapper 已加载");
})();
