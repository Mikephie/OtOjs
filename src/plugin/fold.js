// plugin/fold.js —— 常量折叠
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";

export default function foldPlugin(source, ctx = {}) {
  const ast = parser.parse(source, { sourceType: "unambiguous" });
  let n = 0;

  (traverse.default || traverse)(ast, {
    ConditionalExpression(p) {
      const { test, consequent, alternate } = p.node;
      if (t.isBooleanLiteral(test)) {
        p.replaceWith(test.value ? consequent : alternate);
        n++;
      }
    },
    UnaryExpression(p) {
      if (p.node.operator === "!" && t.isBooleanLiteral(p.node.argument)) {
        p.replaceWith(t.booleanLiteral(!p.node.argument.value));
        n++;
      }
    },
  });

  if (n > 0) {
    ctx.notes?.push?.(`fold: 折叠 ${n} 处常量表达式`);
    return (generate.default || generate)(ast, { compact: false }).code;
  }
  return source;
}