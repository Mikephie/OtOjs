// ========== 秒解 Eval-Packer + 美化 ==========

// 假定 code_packed.js 已经提供了 js_beautify

(function () {
  const inBox  = document.getElementById("codeIn");
  const outBox = document.getElementById("codeOut");

  if (!inBox || !outBox) return;

  function unpackAndBeautify(str) {
    try {
      const evalRe = /^\s*eval\(function\(p,a,c,k,e,(?:r|d)?\).*$/s;
      if (evalRe.test(str)) {
        const unpacked = eval(str); // 执行还原
        return typeof js_beautify === "function"
          ? js_beautify(unpacked, { indent_size: 2 })
          : unpacked;
      }
    } catch (e) {
      console.error("解包失败:", e);
    }
    return str;
  }

  // 自动秒解
  window.addEventListener("load", () => {
    const raw = inBox.value.trim();
    if (!raw) return;
    const decoded = unpackAndBeautify(raw);
    outBox.textContent = decoded;
  });

  // 手动触发
  window.runEvalUnpack = function () {
    const raw = inBox.value.trim();
    if (!raw) return;
    const decoded = unpackAndBeautify(raw);
    outBox.textContent = decoded;
  };
})();
