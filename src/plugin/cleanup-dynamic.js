// src/plugin/cleanup-dynamic.js
// 动态清理插件：删除未引用且无副作用的声明 / 空逻辑

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";

export default function cleanupDynamicPlugin(code, { notes } = {}) {
  if (typeof code !== "string") return code;

  const ast = parser.parse(code, {
    sourceType: "unambiguous",
    plugins: ["jsx", "classProperties", "optionalChaining"]
  });

  let removed = 0;

  // 判断 init 是否纯净
  const isPureInit = (node) => {
    if (!node) return true;
    if (
      t.isStringLiteral(node) ||
      t.isNumericLiteral(node) ||
      t.isBooleanLiteral(node) ||
      t.isNullLiteral(node) ||
      t.isBigIntLiteral(node)
    ) return true;
    if (t.isTemplateLiteral(node) && node.expressions.length === 0) return true;
    if (t.isArrayExpression(node))
      return node.elements.every(el => el && isPureInit(el));
    if (t.isObjectExpression(node))
      return node.properties.every(p => {
        if (t.isObjectProperty(p)) return isPureInit(p.value);
        return false;
      });
    return false;
  };

  traverse(ast, {
    Program(path) {
      path.scope.crawl();
      for (const [name, binding] of Object.entries(path.scope.bindings)) {
        if (!binding || binding.referenced) continue;
        const declPath = binding.path;
        if (!declPath.isVariableDeclarator()) continue;

        const init = declPath.node.init;
        if (isPureInit(init)) {
          const parent = declPath.parentPath;
          if (parent && parent.node && t.isVariableDeclaration(parent.node)) {
            if (parent.node.declarations.length > 1) {
              declPath.remove();
            } else {
              parent.remove();
            }
            removed++;
          }
        }
      }
    },

    IfStatement(path) {
      const { test, consequent, alternate } = path.node;
      const isPureStmt = (stmt) => {
        if (t.isEmptyStatement(stmt)) return true;
        if (t.isBlockStatement(stmt)) return stmt.body.every(isPureStmt);
        if (t.isExpressionStatement(stmt)) {
          return t.isStringLiteral(stmt.expression) ||
                 t.isNumericLiteral(stmt.expression) ||
                 t.isBooleanLiteral(stmt.expression) ||
                 t.isNullLiteral(stmt.expression);
        }
        return false;
      };
      if (t.isBooleanLiteral(test, { value: false }) &&
          consequent.body.every(isPureStmt) &&
          (!alternate || (alternate.body || []).every(isPureStmt))) {
        path.remove(); removed++;
      }
      if (t.isBooleanLiteral(test, { value: true }) &&
          consequent.body.every(isPureStmt)) {
        path.replaceWithMultiple(consequent.body); removed++;
      }
    },

    TryStatement(path) {
      const { block, handler, finalizer } = path.node;
      const empty = (blk) => blk && t.isBlockStatement(blk) && blk.body.length === 0;
      if (empty(block) && (!handler || empty(handler.body)) && (!finalizer || empty(finalizer))) {
        path.remove(); removed++;
      }
    },

    ExpressionStatement(path) {
      if (!path.parentPath.isProgram()) return;
      const e = path.node.expression;
      if (t.isStringLiteral(e) || t.isNumericLiteral(e) ||
          t.isBooleanLiteral(e) || t.isNullLiteral(e)) {
        path.remove(); removed++;
      }
    },
    EmptyStatement(path) { path.remove(); removed++; }
  });

  const out = generate(ast, { retainLines: false, compact: false }).code;
  if (removed > 0) notes?.push?.(`cleanup-dynamic: ${removed}`);
  return out;
}