// utils/format.js
import prettier from "prettier";
import { parse } from "@babel/parser";
import generate from "@babel/generator";

export async function prettyFormat(src) {
  // 保险：任何异常都返回原文
  try {
    // 1) 先试 Prettier v3（是 async）
    try {
      const out = await prettier.format(src, { parser: "babel" });
      if (typeof out === "string" && out.length) return out;
    } catch (e) {
      // 忽略，继续走 Babel
    }

    // 2) 再试 Babel AST 重排
    try {
      const ast = parse(src, {
        sourceType: "unambiguous",
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
      });
      const out = generate(ast, { retainLines: false, compact: false }).code;
      if (typeof out === "string" && out.length) return out;
    } catch (e) {
      // 忽略，落到兜底
    }

    // 3) 兜底：原样返回
    return String(src);
  } catch {
    // 双重兜底：任何环节出问题，都保证返回字符串
    return String(src);
  }
}
