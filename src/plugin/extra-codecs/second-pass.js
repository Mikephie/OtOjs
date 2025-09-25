// src/plugin/extra-codecs/second-pass.js
// 用法：node second-pass.js <infile> <outfile> [--simulate]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as parser from "@babel/parser";
import traverseModule from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import { VM } from "vm2";

const traverse = traverseModule.default;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inFile = process.argv[2];
const outFile = process.argv[3] || "output/output.deob2.js";
const SIMULATE = process.argv.includes("--simulate");

if (!inFile) {
  console.error("[second-pass] 用法：node second-pass.js <infile> <outfile> [--simulate]");
  process.exit(1);
}

const code = fs.readFileSync(inFile, "utf8");

// ---------- 1) 解析 + 抓候选 ----------
const ast = parser.parse(code, {
  sourceType: "unambiguous",
  allowReturnOutsideFunction: true,
  plugins: ["jsx", "optionalChaining"]
});

const HEX_ID = /^_0x[0-9a-fA-F]+$/;

// 别名映射：aliasName -> realName（如 _0xc3dd0a -> _0x1e61）
const aliasMap = new Map();
// 记录调用点
const calls = [];

// 先扫一遍建立“别名”与“真实解码器”的映射
traverse(ast, {
  VariableDeclarator(p) {
    const id = p.node.id;
    const init = p.node.init;
    if (t.isIdentifier(id) && HEX_ID.test(id.name) && t.isIdentifier(init) && HEX_ID.test(init.name)) {
      aliasMap.set(id.name, init.name);
    }
  }
});

// 实用函数：把别名链解到最底
function resolveReal(name) {
  let cur = name, guard = 0;
  while (aliasMap.has(cur) && guard++ < 10_000) cur = aliasMap.get(cur);
  return cur;
}

// 收集调用点
traverse(ast, {
  CallExpression(p) {
    const callee = p.node.callee;
    if (!t.isIdentifier(callee)) return;
    if (!HEX_ID.test(callee.name)) return;

    const real = resolveReal(callee.name);
    // 判断“参数是否可静态求值”
    const argPaths = p.get("arguments");
    const simple = argPaths.every(ap => {
      const { confident } = ap.evaluate();
      return confident;
    });

    calls.push({ path: p, shownName: callee.name, realName: real, simple });
  }
});

console.log("===== SECOND PASS START =====");
console.log(`[second-pass] 发现候选调用 ${calls.length} 处；别名数 ${aliasMap.size}（例如：${[...aliasMap.entries()].slice(0,3).map(([a,b])=>`${a}->${b}`).join(", ") || "无"}）`);

if (!calls.length) {
  finish(ast, code, outFile, "[second-pass] 没发现解码器候选，跳过");
  process.exit(0);
}

// ---------- 2) 模拟模式：先看覆盖面 ----------
if (SIMULATE) {
  let n = 0;
  for (const { path: p, shownName } of calls) {
    const argsText = p.node.arguments.map(a => generate(a).code).join(", ");
    p.replaceWith(t.stringLiteral(`__SIM__${shownName}(${argsText})__`));
    n++;
  }
  console.log(`[second-pass] 模拟模式：已替换 ${n} 处调用为占位串`);
  finish(ast, code, outFile);
  process.exit(0);
}

// ---------- 3) 真实模式：沙箱运行源码，静态回填 ----------
const vm = new VM({
  timeout: 2000,
  sandbox: {
    console: { log(){}, warn(){}, error(){} },
    $request: {}, $response: {}, $done(){},
    global: {},
    window: {}
  },
  eval: true,
  wasm: false
});

try {
  vm.run(code); // 注册 _0x1e61 / _0x1715 / 表函数等
} catch (e) {
  console.log(`[second-pass] sandbox run error（忽略继续）：${e && e.message}`);
}

let evaluated = 0;
const cache = new Map(); // key: "realName(argJSON...)" -> string

for (const { path: p, realName, simple } of calls) {
  if (!simple) continue; // 只处理能静态求值的

  // 让 Babel 计算出实参常量值
  const argVals = p.get("arguments").map(ap => ap.evaluate());
  if (!argVals.every(v => v.confident)) continue;
  const args = argVals.map(v => v.value);

  const key = `${realName}(${JSON.stringify(args)})`;
  if (!cache.has(key)) {
    try {
      // 把常量组装成源码片段在 VM 中调用
      const argCodes = args.map(a => typeof a === "string" ? JSON.stringify(a) : String(a)).join(", ");
      const ret = vm.run(`${realName}(${argCodes})`);
      if (typeof ret === "string") cache.set(key, ret);
    } catch (e) { /* 忽略 */ }
  }
  const decoded = cache.get(key);
  if (typeof decoded === "string") {
    p.replaceWith(t.stringLiteral(decoded));
    evaluated++;
  }
}

if (evaluated) {
  console.log(`[second-pass] 已静态回填 ${evaluated} 处字符串`);
} else {
  console.log(`[second-pass] 未发现可静态求值的调用点（可能参数在更深闭包或运行期变化）`);
}

finish(ast, code, outFile);

// ---------- helper ----------
function finish(ast, original, outFile, msg) {
  const out = generate(ast, { comments: true }).code;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out);
  if (msg) console.log(msg);
  console.log("===== SECOND PASS END =====");
}