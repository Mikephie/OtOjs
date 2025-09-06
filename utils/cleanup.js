// utils/cleanup.js
// 把 obj["safeKey"] → obj.safeKey；安全可读性清理，不改变逻辑。
export function cleanupToDotAccess(code) {
  try {
    // 1) base：a["foo"] → a.foo
    code = code.replace(
      /\b([A-Za-z_$][\w$]*)\s*\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g,
      (m, obj, key) => `${obj}.${key}`
    );
    // 2) 连续层级：.a["b"] → .a.b
    code = code.replace(
      /(\.[A-Za-z_$][\w$]*)\s*\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g,
      (m, pref, key) => `${pref}.${key}`
    );
    // 3) 常用方法名统一为点：["replace"] 等
    code = code.replace(
      /\[\s*["'](replace|split|join|map|filter|some|every|reduce|push|pop|shift|unshift|slice|substr|substring|toString|valueOf|charCodeAt|fromCharCode)\s*["']\s*\]/g,
      ".$1"
    );
    return code;
  } catch {
    return String(code);
  }
}
