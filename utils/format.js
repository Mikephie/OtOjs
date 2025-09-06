// utils/format.js
import prettier from "prettier";
import { parse } from "@babel/parser";
import generate from "@babel/generator";

export async function prettyFormat(src) {
  try {
    // 先试 Prettier（可能会挑样本）
    try {
      const out = await prettier.format(src, { parser: "babel" });
      if (typeof out === "string" && out.length) return out;
    } catch {}

    // 再试 Babel AST 重排
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

    // 全部失败就原样返回
    return String(src);
  } catch {
    return String(src);
  }
}
