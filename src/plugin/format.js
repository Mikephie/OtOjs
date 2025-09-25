// plugin/format.js
// 代码格式化：优先 Prettier；无 Prettier 时回退到 Babel generator（ESM 兼容）

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

/**
 * 尝试使用 Prettier（若未安装会抛错，自动回退）
 */
async function tryPrettierFormat(source) {
  try {
    const prettier = await import("prettier");
    // 新版 Prettier 内置 babel 解析器；旧版可能需要插件，这里先直接尝试
    const formatted = await prettier.format(source, {
      parser: "babel",
      singleQuote: false,
      semi: true,
      printWidth: 100,
      tabWidth: 2,
    });
    return formatted;
  } catch {
    return null; // 触发回退
  }
}

/**
 * Babel 回退格式化：做一些轻量清理后，再生成
 */
function babelFormat(source) {
  const ast = parser.parse(source, {
    sourceType: "unambiguous",
    plugins: ["jsx", "classProperties", "optionalChaining"],
  });

  // 轻量清理：去掉空的块语句、空的 IIFE、重复分号等（尽量保守）
  (traverse.default || traverse)(ast, {
    BlockStatement(path) {
      // 去掉纯空语句
      path.node.body = path.node.body.filter(n => !t.isEmptyStatement(n));
      // 若块内完全为空且父节点允许为空块，保留 {} 即可
    },
    ExpressionStatement(path) {
      // 删除多余的双分号：;; -> ;
      if (t.isEmptyStatement(path.node.expression)) path.remove();
    },
    // 例：(()=>{})();
    CallExpression(path) {
      const callee = path.node.callee;
      if (
        (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) &&
        callee.params.length === 0 &&
        t.isBlockStatement(callee.body) &&
        callee.body.body.length === 0
      ) {
        // 空 IIFE 无副作用，删除
        path.remove();
      }
    },
  });

  const out = (generate.default || generate)(ast, {
    retainLines: false,
    compact: false,
    comments: true,
    jsescOption: { minimal: true },
  }).code;

  return out;
}

export default async function formatPlugin(source, ctx = {}) {
  // 1) 先试 Prettier
  const pretty = await tryPrettierFormat(source);
  if (pretty && pretty.trim().length) {
    ctx.notes?.push?.("format: prettier");
    return pretty;
  }

  // 2) 回退 Babel
  const out = babelFormat(source);
  if (out && out.trim().length) {
    ctx.notes?.push?.("format: babel-generator");
    return out;
  }

  // 3) 都失败则原样返回
  ctx.notes?.push?.("format: skipped");
  return source;
}