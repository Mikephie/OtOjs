import fs from "fs";
import path from "path";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import vm from "vm";

function runSecondPass(inputPath, outputPath) {
  const code = fs.readFileSync(inputPath, "utf8");

  // 1. Parse AST
  const ast = parser.parse(code, {
    sourceType: "unambiguous",
    plugins: ["jsx", "optionalChaining"]
  });

  // 2. 沙盒上下文，能执行残留的解码函数
  const sandbox = {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { timeout: 2000 });
  } catch (e) {
    console.warn("[second-pass] sandbox run error (可能有副作用代码):", e.message);
  }

  // 3. 遍历 AST，找到 `_0x1e61(NUM, 'key')`
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (t.isIdentifier(callee) && callee.name === "_0x1e61") {
        try {
          // 获取实参
          const args = path.node.arguments.map(a => generate(a).code);
          // 在沙盒里运行
          const result = vm.runInContext(`_0x1e61(${args.join(",")})`, sandbox, { timeout: 1000 });
          if (typeof result === "string") {
            // 替换为字面量
            path.replaceWith(t.stringLiteral(result));
          }
        } catch (e) {
          console.warn("[second-pass] decode fail:", e.message);
        }
      }
    }
  });

  // 4. 删除无用的 _0x1715 / _0x1e61 定义
  traverse(ast, {
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && ["_0xodH", "version_"].includes(p.node.id.name)) {
        p.remove();
      }
    },
    FunctionDeclaration(p) {
      if (["_0x1715", "_0x1e61"].includes(p.node.id?.name)) {
        // 如果未再被引用，就删
        if (p.scope.getBinding(p.node.id.name)?.referenced === false) {
          p.remove();
        }
      }
    }
  });

  // 5. 生成结果
  const { code: out } = generate(ast, { comments: false, compact: false });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, out, "utf8");

  console.log(`[second-pass] done: ${outputPath}`);
}

// CLI 用法
const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error("Usage: node src/plugin/extra-codecs/second-pass.js <in> <out>");
  process.exit(1);
}
runSecondPass(inFile, outFile);
