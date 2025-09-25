// src/plugin/extra-codecs/second-pass.js
import fs from "fs";
import path from "path";
import * as parser from "@babel/parser";
import traverseModule from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import vm from "vm";

// 关键：兼容 ESM 下的 @babel/traverse 默认导出
const traverse = traverseModule.default || traverseModule;

function buildParserOptions() {
  return {
    sourceType: "unambiguous",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    plugins: [
      "jsx",
      "classProperties",
      "classPrivateProperties",
      "classPrivateMethods",
      "optionalChaining",
      "objectRestSpread",
      "numericSeparator",
      "topLevelAwait",
      "dynamicImport"
    ]
  };
}

// 尝试从 AST 抽取“解码器最小子集”源码：_0xodH / _0x1715 / _0x1e61 以及相关 IIFE
function extractDecoderBootstrap(ast) {
  const chunks = [];
  const wantIds = new Set(["_0xodH", "_0x1715", "_0x1e61"]);

  traverse(ast, {
    VariableDeclaration(p) {
      // 取出 var _0xodH = 'jsjiami.com.v7'; 等
      const src = generate.default ? generate.default(p.node).code : generate(p.node).code;
      for (const d of p.node.declarations) {
        if (t.isIdentifier(d.id) && wantIds.has(d.id.name)) {
          chunks.push(src);
          break;
        }
      }
    },
    FunctionDeclaration(p) {
      const id = p.node.id?.name;
      if (id && wantIds.has(id)) {
        const src = generate.default ? generate.default(p.node).code : generate(p.node).code;
        chunks.push(src);
      }
    },
    // IIFE 包裹：含有 _0x1715 或 _0x1e61 的立即执行函数
    CallExpression(p) {
      try {
        const code = (generate.default ? generate.default : generate)(p.node).code;
        if (/_0x1715|_0x1e61/.test(code) && /\)\(/.test(code)) {
          chunks.push(code);
        }
      } catch {}
    }
  });

  // 去重并按出现顺序拼接
  const seen = new Set();
  const ordered = [];
  for (const c of chunks) {
    if (!seen.has(c)) {
      seen.add(c);
      ordered.push(c);
    }
  }
  return ordered.join("\n");
}

function makeSandbox() {
  // 预置 Safari/QuantumultX 类环境的最小哨兵，避免报错
  const sandbox = {
    console,
    globalThis: undefined,
    $request: { headers: {}, url: "", method: "GET", body: "" },
    $response: { body: "" },
    $done: function () {},
    // 常见宿主 API 哨兵
    fetch: undefined,
    window: undefined,
    document: undefined,
    location: undefined
  };
  vm.createContext(sandbox);
  return sandbox;
}

function tryEval(code, sandbox, label = "script") {
  try {
    vm.runInContext(code, sandbox, { timeout: 1200 });
    return true;
  } catch (e) {
    console.warn(`[second-pass] sandbox run error in ${label}:`, e.message);
    return false;
  }
}

function decodeCalls(ast, sandbox, fnNames = ["_0x1e61"]) {
  let replaced = 0;

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee)) return;
      if (!fnNames.includes(callee.name)) return;

      // 仅处理形如 _0x1e61(NUM, 'key') 的简单调用
      // 对参数做 codegen，再在沙盒里执行
      try {
        const argsCode = path.node.arguments.map(arg => (generate.default ? generate.default(arg).code : generate(arg).code)).join(",");
        const expr = `${callee.name}(${argsCode})`;
        const res = vm.runInContext(expr, sandbox, { timeout: 500 });
        if (typeof res === "string") {
          path.replaceWith(t.stringLiteral(res));
          replaced++;
        }
      } catch (e) {
        // 静默跳过
      }
    }
  });

  return replaced;
}

function removeIfUnused(ast, name) {
  let removed = 0;
  traverse(ast, {
    Program: {
      exit(p) {
        const bind = p.scope.getBinding(name);
        if (bind && !bind.referenced) {
          // 移除声明（FunctionDeclaration / VariableDeclarator）
          const target = bind.path;
          if (target && (target.isFunctionDeclaration() || target.isVariableDeclarator() || target.isVariableDeclaration())) {
            // 移除父层 VariableDeclaration 更干净
            if (target.isVariableDeclarator() && target.parentPath?.isVariableDeclaration()) {
              target.parentPath.remove();
            } else {
              target.remove();
            }
            removed++;
          }
        }
      }
    }
  });
  return removed;
}

function runSecondPass(inputPath, outputPath) {
  const raw = fs.readFileSync(inputPath, "utf8");
  const parseOpts = buildParserOptions();
  const ast = parser.parse(raw, parseOpts);

  // 1) 先尝试最小化执行仅“解码器子集”
  const bootstrap = extractDecoderBootstrap(ast);
  const sandbox = makeSandbox();
  let ok = false;
  if (bootstrap.trim()) {
    ok = tryEval(bootstrap, sandbox, "bootstrap");
  }

  // 2) 如果最小子集失败，再带哨兵跑全量（高风险，但有时必要）
  if (!ok) {
    tryEval(raw, sandbox, "full-code");
  }

  // 3) 解码调用（默认匹配 _0x1e61，如需适配更多名字可扩大 fnNames）
  const replaced = decodeCalls(ast, sandbox, ["_0x1e61"]);
  console.log(`[second-pass] replaced calls: ${replaced}`);

  // 4) 清理未使用的解码器/水印
  const removed1 = removeIfUnused(ast, "_0x1e61");
  const removed2 = removeIfUnused(ast, "_0x1715");
  const removed3 = removeIfUnused(ast, "_0xodH");
  const removed4 = removeIfUnused(ast, "version_");
  console.log(`[second-pass] removed defs: _0x1e61(${removed1}), _0x1715(${removed2}), _0xodH(${removed3}), version_(${removed4})`);

  // 5) 输出
  const { code: out } = (generate.default ? generate.default : generate)(ast, { comments: false, compact: false });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, out, "utf8");
  console.log(`[second-pass] done: ${outputPath}`);
}

// CLI
const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error("Usage: node src/plugin/extra-codecs/second-pass.js <input.js> <output.deob2.js>");
  process.exit(1);
}
runSecondPass(inFile, outFile);
