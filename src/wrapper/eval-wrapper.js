/**
 * Eval 解包插件包装器 - 前端版本
 * 捕获 eval 参数，失败返回 null
 */
(function () {
  const module = { exports: {} };

  // ====== Eval 原始逻辑 ======
  function plugin(code) {
    try {
      if (!code.includes("eval(") && !code.includes("eval (")) return null;

      let modified = code.replace(/eval\s*\(/g, "(function(x){return x;})(");

      try {
        const env = {
          window: {},
          document: {},
          navigator: { userAgent: "Mozilla/5.0" },
          location: {},
        };

        const result = Function("window", "document", "navigator", "location",
          `return ${modified}`)(
          env.window, env.document, env.navigator, env.location
        );

        if (typeof result === "string") {
          return result.includes("eval(") ? plugin(result) : result;
        }
        return String(result);
      } catch (e) {
        console.warn("[Eval] 替换执行失败，尝试直接替换:", e);
        try {
          modified = code.replace(/eval\s*\(/g, "(");
          return modified !== code ? modified : null;
        } catch {
          return null;
        }
      }
    } catch (err) {
      console.error("[Eval] 解包错误:", err);
      return null;
    }
  }

  module.exports.plugin = plugin;
  // ====== END ======

  window.DecodePlugins = window.DecodePlugins || {};
  window.DecodePlugins.eval = {
    detect: (code) => /eval\s*\(/.test(code) || /eval\s*\s*\(/.test(code),
    plugin: (code) => {
      try {
        const result = module.exports.plugin(code);
        return result !== null ? result : null;
      } catch (e) {
        console.error("[Eval] 插件调用失败:", e);
        return null;
      }
    },
  };

  console.log("✅ Eval wrapper 已加载");
})();
