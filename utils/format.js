// utils/format.js
import prettier from "prettier";
import { parse } from "@babel/parser";
import generate from "@babel/generator";

// 宽松版本（不抛错），你若别处用得到可以保留
export async function prettyFormat(src) {
  try {
    try {
      const out = await prettier.format(src, { parser: "babel" });
      if (typeof out === "string" && out.length) return out;
    } catch {}
    try {
      const ast = parse(src, {
        sourceType: "unambiguous",
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
      });
      const out = generate(ast, { retainLines: false, compact: false }).code;
      if (typeof out === "string" && out.length) return out;
    } catch {}
    return String(src);
  } catch {
    return String(src);
  }
}

// 严格版本（必须成功，否则抛错）
export async function prettyFormatStrict(src) {
  // 先 Prettier
  try {
    const out = await prettier.format(src, { parser: "babel" });
    if (typeof out === "string" && out.length) return out;
  } catch {}
  // 再 Babel
  try {
    const ast = parse(src, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
    });
    const out = generate(ast, { retainLines: false, compact: false }).code;
    if (typeof out === "string" && out.length) return out;
  } catch {}
  // 两者都失败 → 抛错
  throw new Error("format 失败");
}
