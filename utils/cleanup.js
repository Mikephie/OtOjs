// utils/cleanup.js
// 仅做“可读性”清理：把 obj["safeKey"] → obj.safeKey；不改动包含特殊字符/数字开头/保留字的键。
// 同时把 a["replace"](…) 这类常见模式转点访问。
export function cleanupToDotAccess(code) {
  try {
    // 1) a["foo"] → a.foo   （foo 必须是合法标识符）
    code = code.replace(/\b([A-Za-z_$][\w$]*)\s*\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g, (m, obj, key) => {
      // 保留字也允许成员访问（JS 允许 obj.default），这里不过度限制
      return `${obj}.${key}`;
    });

    // 2) 连续层级：obj["a"]["b"] → obj.a.b
    code = code.replace(/(\.[A-Za-z_$][\w$]*)\s*\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g, (m, pref, key) => {
      return `${pref}.${key}`;
    });

    // 3) 统一把 ["replace"] / ["split"] / ["join"] 等常用方法转点（这些是安全标识符）
    code = code.replace(/\[\s*["'](replace|split|join|map|filter|some|every|reduce|push|pop|shift|unshift|slice|substr|substring|toString|valueOf|charCodeAt|fromCharCode)\s*["']\s*\]/g, ".$1");

    return code;
  } catch {
    return String(code);
  }
}
