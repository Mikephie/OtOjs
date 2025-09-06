// plugins/jsjiami_v7.js
export default async function jsjiamiV7(input) {
  if (!/jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(input))
    return null;

  let code = input;

  // 保留 encode_version 行
  code = code.replace(/;?\s*var\s+encode_version\s*=\s*['"]jsjiami\.com\.v7['"];?/i, (m) => m);

  // 去除常见自校验 try-catch（保守）
  code = code.replace(/try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g, "/* [strip:try-catch-self-check] */");

  // 去除明显死代码 wrapper（保守）
  code = code.replace(/if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g, "/* [strip:dead-wrapper] */");

  return code;
}
