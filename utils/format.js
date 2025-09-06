// utils/format.js
import prettier from "prettier";
import { parse } from "@babel/parser";
import generate from "@babel/generator";

export async function prettyFormatStrict(src) {
  // 先试 Prettier
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
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport", "classStaticBlock", "topLevelAwait"],
    });
    const out = generate(ast, { retainLines: false, compact: false }).code;
    if (typeof out === "string" && out.length) return out;
  } catch {}
  // 两者都失败则抛错（严格模式）
  throw new Error("format 失败");
}
