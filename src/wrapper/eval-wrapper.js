/**
 * Eval解包工具包装器 - 将Eval解包工具转换为浏览器可用版本
 */
// 创建自执行函数来隔离作用域
(function() {
  // 模拟Node.js环境
  const module = { exports: {} };
  const exports = module.exports;
  
  // 以下粘贴原始eval-decoder.js插件代码
  // ====== 开始: 原始eval-decoder.js代码 ======
  
  /**
   * 解包eval加密的代码
   * @param {string} code - 要解包的代码
   * @returns {string|null} - 解包后的代码或null（解包失败时）
   */
  function plugin(code) {
    try {
      // 如果不包含eval，直接返回null
      if (!code.includes('eval(') && !code.includes('eval (')) {
        return null;
      }
      
      // 替换eval为一个捕获函数
      let modifiedCode = code.replace(/eval\s*\(/g, '(function(x) { return x; })(');
      
      // 尝试执行修改后的代码获取eval的参数
      try {
        // 创建一个执行环境
        const env = {
          window: {},
          document: {},
          navigator: { userAgent: "Mozilla/5.0" },
          location: {}
        };
        
        // 执行代码
        const result = Function('window', 'document', 'navigator', 'location',
                              `return ${modifiedCode}`)(
                              env.window, env.document, env.navigator, env.location);
        
        // 如果结果是字符串且包含eval，递归解包
        if (typeof result === 'string') {
          if (result.includes('eval(')) {
            return plugin(result);
          }
          return result;
        }
        
        return String(result);
      } catch (err) {
        console.log("执行替换eval的方法失败，尝试直接替换方法");
        
        // 尝试直接替换eval
        try {
          modifiedCode = code.replace(/eval\s*\(/g, '(');
          return modifiedCode;
        } catch (replaceErr) {
          console.error("直接替换eval方法也失败:", replaceErr);
          return null;
        }
      }
    } catch (error) {
      console.error("Eval解包发生错误:", error);
      return null;
    }
  }
  
  // 导出插件接口
  exports.plugin = function(code) {
    return plugin(code);
  };
  
  // ====== 结束: 原始eval-decoder.js代码 ======
  
  // 将插件注册到全局解密插件库
  window.DecodePlugins = window.DecodePlugins || {};
  window.DecodePlugins.eval = {
    detect: function(code) {
      // 检测是否包含eval调用
      return code.includes('eval(') || code.includes('eval (');
    },
    plugin: function(code) {
      // 使用原始模块的功能
      return module.exports.plugin(code);
    }
  };
  
  console.log("Eval解包插件已加载");
})();
