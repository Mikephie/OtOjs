// utils/cleanup.js
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function cleanupToDotAccess(src) {
  const ast = parse(src, {
    sourceType: "unambiguous",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
  });

  traverse(ast, {
    MemberExpression(path) {
      const { node } = path;
      if (node.computed && t.isStringLiteral(node.property)) {
        const key = node.property.value;
        if (IDENT_RE.test(key)) {
          // 形如 a["replace"] -> a.replace
          node.computed = false;
          node.property = t.identifier(key);
        }
      }
    },
  });

  return generate(ast, { retainLines: false, compact: false }).code;
}
