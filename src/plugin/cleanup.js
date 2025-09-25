// plugin/cleanup.js —— 清理未引用的 _0x 符号（支持 ESM）

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";

export default function cleanupPlugin(source, ctx = {}) {
  const ast = parser.parse(source, {
    sourceType: "unambiguous",
    plugins: ["jsx", "classProperties", "optionalChaining"],
  });

  let removed = 0;

  (traverse.default || traverse)(ast, {
    Program(programPath) {
      const bindings = programPath.scope.getAllBindings();

      for (const [name, binding] of Object.entries(bindings)) {
        if (!/^_0x/.test(name)) continue;

        // 删除未引用 或 仅引用自身定义的
        if (
          binding.referencePaths.length === 0 ||
          (binding.referencePaths.length === 1 && binding.referencePaths[0].key === "id")
        ) {
          const defPath = binding.path;
          if (defPath.isFunctionDeclaration()) {
            defPath.remove();
            removed++;
          } else if (defPath.isVariableDeclarator()) {
            const declPath = defPath.parentPath;
            defPath.remove();
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
    }).code;
  }
  ctx.notes?.push?.("cleanup: 无可清理项");
  return source;
}