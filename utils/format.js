// utils/format.js
import prettier from "prettier";
import { parse } from "@babel/parser";
import generate from "@babel/generator";

export function prettyFormat(src) {
  try {
    return prettier.format(src, { parser: "babel" });
  } catch {}

  try {
    const ast = parse(src, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"]
    });
    return generate.default(ast, { retainLines: false, compact: false }).code;
  } catch {}

  return src;
}
