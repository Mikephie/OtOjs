
/**
 * AADecode插件包装器 - 将Node.js的AADecode模块转换为浏览器可用版本
 */

// 创建自执行函数来隔离作用域
(function() {
  // 模拟Node.js环境
  const module = { exports: {} };
  
  // ====== 开始: 原始aadecode.js代码 ======
  // AADecode Plugin (CommonJS版本) - 保留脚本头部注释信息

  /**
   * 识别并提取AADecode编码之前的注释和配置信息
   * @param {string} code - 完整的代码字符串
   * @returns {object} - 包含头部信息和编码部分的对象
   */
  function extractHeader(code) {
    // 查找AADecode特征的起始位置
    const aaStartIndex = code.search(/ﾟωﾟﾉ\s*=|ﾟдﾟ\s*=|ﾟДﾟ\s*=|ﾟΘﾟ\s*=/);
    
    if (aaStartIndex > 0) {
      // 提取头部内容和AA编码部分
      const header = code.substring(0, aaStartIndex).trim();
      const encodedPart = code.substring(aaStartIndex);
      
      return {
        header,
        encodedPart
      };
    }
    
    // 如果没有找到AADecode特征，则返回完整代码作为编码部分
    return {
      header: '',
      encodedPart: code
    };
  }

  /**
   * 解码AA编码的JavaScript代码，同时保留原始脚本的头部注释
   * @param {string} code - 包含可能的头部注释和AA编码的完整代码
   * @returns {string|null} - 解码后的脚本（保留头部注释）或null（如果解码失败）
   */
  function plugin(code) {
    try {
      // 提取头部注释和编码部分
      const { header, encodedPart } = extractHeader(code);
      
      // 检查是否为AA编码内容
      if (!(encodedPart.includes('ﾟДﾟ') || encodedPart.includes('(ﾟΘﾟ)') || 
            encodedPart.includes('ﾟωﾟﾉ') || encodedPart.includes('ﾟдﾟ'))) {
        return null;
      }
      
      // 应用AADecode解码逻辑
      let decodePart = encodedPart;
      decodePart = decodePart.replace(") ('_')", "");
      decodePart = decodePart.replace("(ﾟДﾟ) ['_'] (", "return ");
      
      // 创建函数并执行解码
      const x = new Function(decodePart);
      const decodedContent = x();
      
      // 如果存在头部，则保留并拼接
      if (header) {
        return `${header}\n\n${decodedContent}`;
      }
      
      return decodedContent;
    } catch (error) {
      console.error('AADecode解码错误:', error);
      return null;
    }
  }

  // 直接导出plugin函数
  module.exports = plugin;
  // ====== 结束: 原始aadecode.js代码 ======
  
  // 将插件注册到全局解密插件库
  window.DecodePlugins = window.DecodePlugins || {};
  window.DecodePlugins.aadecode = {
    detect: function(code) {
      // 检测是否包含AADecode的特征标记
      return code.includes('ﾟωﾟﾉ') || code.includes('ﾟДﾟ') || 
             code.includes('ﾟдﾟ') || code.includes('ﾟΘﾟ');
    },
    plugin: function(code) {
      // 调用原始插件函数
      try {
        console.log("尝试解密AADecode编码...");
        const result = module.exports(code);
        
        // 如果解码失败，返回原始代码；否则返回解码后的结果
        return result !== null ? result : code;
      } catch (e) {
        console.error("AADecode插件错误:", e);
        return code;
      }
    }
  };
  
  console.log("AADecode插件已加载");
})();
