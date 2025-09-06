// utils/format.js
import prettier from "prettier";
import { parse } from "@babel/parser";
import generate from "@babel/generator";

export function prettyFormat(src) {
  // 先试 Prettier
  try {
    return prettier.format(src, { parser: "babel" });
  } catch {}

  // 再用 Babel AST 重排
  try {
    const ast = parse(src, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"]
    });
    return generate(ast, { retainLines: false, compact: false }).code;
  } catch {}

  // 全部失败就原样返回
  return src;
}
