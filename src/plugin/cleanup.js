// plugin/cleanup.js
// 清理死函数、未引用的 _0x 系列变量

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

export default function cleanupPlugin(source, ctx = {}) {
  const ast = parse(source, { sourceType: "unambiguous" });

  // 收集所有引用过的标识符
  const used = new Set();

  traverse(ast, {
    Identifier(path) {
      used.add(path.node.name);
    }
  });

  let removed = 0;

  // 删除未被引用的函数声明和变量声明
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name && /^_0x/.test(name) && !used.has(name)) {
        path.remove();
        removed++;
      }
    },
    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (name && /^_0x/.test(name) && !used.has(name)) {
        path.remove();
        removed++;
      }
    }
  });

  if (removed > 0) {
    ctx.notes?.push?.(`cleanup: 移除了 ${removed} 个死函数/变量`);
    return generate(ast, { compact: false }).code;
  }

  return source;
}