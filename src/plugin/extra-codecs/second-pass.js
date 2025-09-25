// src/plugin/extra-codecs/second-pass.js
// Second pass: evaluate obfuscated decoder calls with constant args and replace them.
// Usage: node src/plugin/extra-codecs/second-pass.js inputFile outputFile

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as parser from "@babel/parser";

// ESM-friendly imports (important!)
import traverseModule from "@babel/traverse";
const traverse = traverseModule.default;

import generatorModule from "@babel/generator";
const generate = generatorModule.default;

import * as t from "@babel/types";
import { VM } from "vm2";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------- CLI args --------
const inFile = process.argv[2] || path.resolve(process.cwd(), "output/output.js");
const outFile =
  process.argv[3] || path.resolve(process.cwd(), "output/output.deob2.js");

function log(...args) {
  console.log(...args);
}

// -------- Parser options --------
const parserOpts = {
  sourceType: "unambiguous",
  allowReturnOutsideFunction: true,
  plugins: [
    "jsx",
    "classProperties",
    "classPrivateProperties",
    "classPrivateMethods",
    "objectRestSpread",
    "optionalChaining",
    "nullishCoalescingOperator",
    "numericSeparator",
    "bigInt",
    "topLevelAwait",
  ],
};

// -------- Read & parse --------
const code = fs.readFileSync(inFile, "utf8");
const ast = parser.parse(code, parserOpts);

// -------- Heuristics to find decoder funcs & aliases --------
const decoderNameRe = /^_0x[0-9a-f]+$/i;

// function declarations / variable-declared function expressions with names like _0x****
// also collect alias like: const _0xc3dd0a = _0x1e61;
const functionDecls = new Map(); // name -> node
const aliasPairs = []; // [alias, target]

traverse(ast, {
  FunctionDeclaration(p) {
    const id = p.node.id?.name;
    if (id && decoderNameRe.test(id)) {
      functionDecls.set(id, p.node);
    }
  },
  VariableDeclarator(p) {
    const id = p.node.id;
    const init = p.node.init;
    if (!id || id.type !== "Identifier" || !init) return;

    // alias: const alias = _0xabc123;
    if (init.type === "Identifier") {
      const alias = id.name;
      const target = init.name;
      if (decoderNameRe.test(alias) && decoderNameRe.test(target)) {
        aliasPairs.push([alias, target]);
      }
    }

    // named function expression: const _0xabc123 = function (...) {...}
    if (
      (init.type === "FunctionExpression" || init.type === "ArrowFunctionExpression") &&
      decoderNameRe.test(id.name)
    ) {
      // synthesize a FunctionDeclaration for uniform handling
      const fakeDecl = t.functionDeclaration(
        t.identifier(id.name),
        init.params,
        init.type === "ArrowFunctionExpression"
          ? t.blockStatement([t.returnStatement(init.body)])
          : init.body,
      );
      functionDecls.set(id.name, fakeDecl);
    }
  },
});

// Special helper providers that many obfuscators use (e.g. _0x1715 -> returns array)
const helperNames = new Set(["_0x1715"]); // 可按需要扩展
traverse(ast, {
  FunctionDeclaration(p) {
    const id = p.node.id?.name;
    if (id && helperNames.has(id)) {
      functionDecls.set(id, p.node);
    }
  },
});

// -------- Build a safe VM with just those functions/aliases --------
let bootSrc = "";
for (const [, fn] of functionDecls) {
  bootSrc += generate(fn, { comments: false }).code + "\n";
}
for (const [alias, target] of aliasPairs) {
  bootSrc += `var ${alias} = ${target};\n`;
}

// 有些样本还会出现 `var version_ = 'jsjiami.com.v7'` 等变量，
// 不影响求值，这里无需特别处理。

const vm = new VM({
  timeout: 2000,
  sandbox: {},
});

// try create callable table
let decoderCallable = new Map();
try {
  vm.run(bootSrc);
  for (const name of functionDecls.keys()) {
    // 仅把真正看起来像“索引+key”的解码器收进来
    // 供调用点静态求值时匹配
    if (decoderNameRe.test(name)) {
      const fn = vm.run(`typeof ${name} === 'function' ? ${name} : null`);
      if (typeof fn === "function") decoderCallable.set(name, fn);
    }
  }
  // 把 alias 也映射成可调用
  for (const [alias, target] of aliasPairs) {
    if (decoderCallable.has(target)) {
      const fn = vm.run(`typeof ${target} === 'function' ? ${target} : null`);
      if (typeof fn === "function") decoderCallable.set(alias, fn);
    }
  }
} catch (e) {
  log("[second-pass] sandbox init error：", e?.message || e);
}

// -------- Utility: test if node is a constant (literal-ish) --------
function isConstNode(n) {
  if (!n) return false;
  if (t.isStringLiteral(n) || t.isNumericLiteral(n) || t.isBooleanLiteral(n) || t.isNullLiteral(n) || t.isBigIntLiteral(n)) return true;
  if (t.isUnaryExpression(n) && ["+", "-", "~", "!"].includes(n.operator)) {
    return isConstNode(n.argument);
  }
  // template literals without expressions
  if (t.isTemplateLiteral(n) && n.expressions.length === 0) return true;
  return false;
}

function nodeToValue(n) {
  if (t.isStringLiteral(n)) return n.value;
  if (t.isNumericLiteral(n)) return n.value;
  if (t.isBooleanLiteral(n)) return n.value;
  if (t.isNullLiteral(n)) return null;
  if (t.isBigIntLiteral(n)) return BigInt(n.value);
  if (t.isUnaryExpression(n)) {
    const v = nodeToValue(n.argument);
    // 只处理常见一元
    try {
      switch (n.operator) {
        case "+": return +v;
        case "-": return -v;
        case "~": return ~v;
        case "!": return !v;
      }
    } catch {
      return undefined;
    }
  }
  if (t.isTemplateLiteral(n) && n.expressions.length === 0) {
    return n.quasis[0].value.cooked ?? n.quasis[0].value.raw;
  }
  return undefined;
}

// -------- Traverse calls & replace --------
let candidateCalls = 0;
let replaced = 0;

traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;

    // 仅处理简单标识符调用：_0x1e61(...), _0xc3dd0a(...)
    if (!t.isIdentifier(callee)) return;
    const name = callee.name;
    if (!decoderCallable.has(name)) return;

    // 参数必须全是常量；（更激进的情况可自行扩展）
    const args = path.node.arguments;
    if (!args.length || !args.every(isConstNode)) return;

    candidateCalls++;

    // 取值
    const argv = args.map(nodeToValue);
    try {
      // 用 VM 执行解码函数
      // 注意：这里通过 vm.run 间接调用，而不是把函数带回宿主。
      // 传参通过全局临时变量的方式安全传递。
      vm.run(`globalThis.__args = ${JSON.stringify(argv)};`);
      const result = vm.run(`${name}.apply(null, globalThis.__args)`);

      // 替换结果：仅接收 string/number/bool/bigint/null
      if (
        typeof result === "string" ||
        typeof result === "number" ||
        typeof result === "boolean" ||
        typeof result === "bigint" ||
        result === null
      ) {
        let replacement;
        if (typeof result === "string") replacement = t.stringLiteral(result);
        else if (typeof result === "number")
          replacement = t.numericLiteral(result);
        else if (typeof result === "boolean")
          replacement = t.booleanLiteral(result);
        else if (typeof result === "bigint")
          replacement = t.bigIntLiteral(result.toString() + "n");
        else replacement = t.nullLiteral();

        path.replaceWith(replacement);
        replaced++;
      }
    } catch (e) {
      // 忽略单点失败，继续走
    }
  },
});

// -------- Print stats & write --------
if (candidateCalls === 0) {
  log("===== SECOND PASS START =====");
  log("[second-pass] 未发现可静态求值的调用点（可能参数不是常量，或候选在更深的闭包里）");
  log("===== SECOND PASS END =====");
} else {
  log("===== SECOND PASS START =====");
  log(`[second-pass] 发现候选调用 ${candidateCalls} 处`);
  log(`[second-pass] 已静态回填 ${replaced} 处`);
  const out = generate(ast, { comments: true }).code;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out);
  log("===== SECOND PASS END =====");
}