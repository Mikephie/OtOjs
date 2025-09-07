// plugins/jsjiami_v5.js
// 目标：识别 jsjiami v5 标记，做保守清壳（不改逻辑），返回字符串；失败返回 null。
export default async function jsjiamiV5(input) {
  const text = String(input);
  if (!/jsjiami\.com\.v5|encode_version\s*=\s*['"]jsjiami\.com\.v5['"]/i.test(text)) {
    return null; // 非 v5，交给其他插件
  }
  let code = text;

  // 保留/或移除 encode_version 行（按需，这里选择保留原行）
  // 若你想干净一点，可以把下行的 (m)=>"" 改成 (m)=>m 保留它
  code = code.replace(
    /;?\s*encode_version\s*=\s*['"]jsjiami\.com\.v5['"]\s*;?/i,
    (m) => m // 改为 "" 则移除此行
  );

  // 常见自检/死壳清理（保守，不动业务逻辑）
  code = code.replace(
    /try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g,
    "/* [strip:try-catch-self-check:v5] */"
  );
  code = code.replace(
    /if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g,
    "/* [strip:dead-wrapper:v5] */"
  );

  // v5 常见并不强依赖运行期解码；若你的样本里还有 _0x*** 调用，再按样本补 AST pass。
  return code;
}
