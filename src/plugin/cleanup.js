// plugin/cleanup.js
// 清理未被引用的 _0x 系列函数/变量（ESM 兼容）

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

export default function cleanupPlugin(source, ctx = {}) {
  const ast = parser.parse(source, {
    sourceType: "unambiguous",
    plugins: ["jsx", "classProperties", "optionalChaining"],
  });

  let removed = 0;

  // 第一轮：建立作用域与绑定信息
  (traverse.default || traverse)(ast, {});

  // 第二轮：仅在“顶层作用域”检查绑定，确保不误删局部同名标识符
  (traverse.default || traverse)(ast, {
    Program(programPath) {
      const bindings = programPath.scope.getAllBindings();

      // 删除未被引用的函数声明（_0x 前缀）
      for (const [name, binding] of Object.entries(bindings)) {
        if (!/^_0x/.test(name)) continue;
        if (binding.kind !== "hoisted" && binding.kind !== "const" && binding.kind !== "let" && binding.kind !== "var") continue;

        // 只删除“完全未被引用”的绑定
        if (binding.referencePaths.length === 0) {
          const defPath = binding.path;
          if (defPath.isFunctionDeclaration()) {
            defPath.remove();
            removed++;
          } else if (defPath.isVariableDeclarator()) {
            const declPath = defPath.parentPath; // VariableDeclaration
            defPath.remove();
            // 若该声明已无剩余声明符，删除整条声明
            if (declPath && declPath.isVariableDeclaration() && declPath.node.declarations.length === 0) {
              declPath.remove();
            }
            removed++;
          }
        }
      }
    },
  });

  if (removed > 0) {
    ctx.notes?.push?.(`cleanup: 移除了 ${removed} 个未引用的 _0x 符号`);
    return (generate.default || generate)(ast, {
      retainLines: false,
      compact: false,
      comments: true,
      jsescOption: { minimal: true },
    }).code;
  }

  ctx.notes?.push?.("cleanup: 无可清理项");
  return source;
}