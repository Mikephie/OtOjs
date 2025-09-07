// plugins/jsjiami_v7.js
// 自适应 jsjiami v7：自动寻找“f(数字, 字符串)”解密器，运行期解码并文字化替换。
// 失败则返回 null 让上游继续兜底格式化。
import ivm from "isolated-vm";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";

const MAX_SRC_LEN = 2_000_000;

export default async function jsjiamiV7(input) {
  const text = String(input);
  if (!/jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(text)) {
    return null; // 非 v7，交给别的插件
  }

  let ast;
  try {
    ast = parse(text.length > MAX_SRC_LEN ? text.slice(0, MAX_SRC_LEN) : text, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
    });
  } catch {
    // 解析失败，退回清壳
    return stripShellKeepMarker(text);
  }

  // 1) 找“f(数字, 字符串)”模式出现频率最高的函数名（候选解密器）
  const freq = new Map();
  const callSites = [];
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      const args = path.node.arguments;
      if (
        t.isIdentifier(callee) &&
        args.length === 2 &&
        t.isNumericLiteral(args[0]) &&
        (isStaticString(args[1]))
      ) {
        const name = callee.name;
        callSites.push({ path, name, idx: args[0], keyNode: args[1] });
        freq.set(name, (freq.get(name) || 0) + 1);
      }
    },
  });
  if (callSites.length === 0) {
    // 没有任何此类调用，回退清壳
    return stripShellKeepMarker(text);
  }

  const candidate = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // 2) 收集候选解密器及其依赖（表函数/辅助函数/变量）
  const neededNames = new Set([candidate, "_0xodH"]); // _0xodH 常见依赖
  const declMap = new Map(); // name -> node
  traverse(ast, {
    FunctionDeclaration(path) {
      const id = path.node.id?.name;
      if (id) declMap.set(id, path.node);
    },
    VariableDeclarator(path) {
      const id = path.node.id;
      if (t.isIdentifier(id)) {
        declMap.set(id.name, path.findParent((p) => p.isVariableDeclaration())?.node || path.node);
      }
    },
  });

  // 递归向内查找依赖（仅顶层 Identifier 的引用）
  const visited = new Set();
  function collectDeps(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const node = declMap.get(name);
    if (!node) return;
    t.traverseFast(node, (n) => {
      if (t.isIdentifier(n)) {
        const dep = n.name;
        if (declMap.has(dep)) neededNames.add(dep);
      }
    });
  }
  // 从候选函数开始收集
  neededNames.forEach((n) => collectDeps(n));
  // 再跑一轮确保依赖的依赖也被收集
  for (const n of Array.from(neededNames)) collectDeps(n);

  // 3) 构造沙箱启动代码：仅注入必要声明 + 解密桥
  const bootNodes = [];
  for (const name of neededNames) {
    const node = declMap.get(name);
    if (node) bootNodes.push(node);
  }
  if (bootNodes.length === 0) {
    return stripShellKeepMarker(text);
  }
  const preface = [
    `var _0xodH = "jsjiami.com.v7";`,
    // 部分环境兼容
    `var window = {}; var self = {}; var globalThis = global;`,
  ].join("\n");
  const bootCode = preface + "\n" + bootNodes.map((n) => generate.default(n).code).join("\n") + `
    global.__dec = function(i, k) {
      try { return ${candidate}(i, k); } catch (e) { return null; }
    };
  `;

  // 4) 启动 isolated-vm
  let isolate, context;
  try {
    isolate = new ivm.Isolate({ memoryLimit: 64 });
    context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());

    const script = await isolate.compileScript(bootCode, { filename: "jjv7-boot.js" });
    await script.run(context, { timeout: 500 });
  } catch {
    if (context) await context.release();
    if (isolate) isolate.dispose();
    return stripShellKeepMarker(text);
  }

  // 5) 只替换候选函数的调用；其余保持不动
  const fullAst = parse(text, {
    sourceType: "unambiguous",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
  });

  // 收集需要替换的节点（避免在遍历里 await）
  const jobs = [];
  traverse(fullAst, {
    CallExpression(path) {
      const callee = path.node.callee;
      const args = path.node.arguments;
      if (
        t.isIdentifier(callee, { name: candidate }) &&
        args.length === 2 &&
        t.isNumericLiteral(args[0]) &&
        isStaticString(args[1])
      ) {
        const idx = args[0].value;
        const key = evalStaticString(args[1]);
        jobs.push({ path, idx, key });
      }
    },
  });

  let replaced = 0;
  for (const job of jobs) {
    try {
      const val = await context.eval(`__dec(${job.idx}, ${JSON.stringify(job.key)})`, { timeout: 100 });
      if (typeof val === "string") {
        job.path.replaceWith(t.stringLiteral(val));
        replaced++;
      }
    } catch {
      // 忽略单点失败
    }
  }

  // 清理：移除候选解密器及它的表函数（仅顶层定义）
  traverse(fullAst, {
    FunctionDeclaration(path) {
      const id = path.node.id?.name;
      if (id && neededNames.has(id)) path.remove();
    },
    VariableDeclarator(path) {
      const id = path.node.id;
      if (t.isIdentifier(id) && neededNames.has(id.name)) {
        const decl = path.findParent((p) => p.isVariableDeclaration());
        if (decl && decl.node.declarations.length === 1) {
          decl.remove();
        } else {
          path.remove();
        }
      }
    },
  });

  const out = generate.default(fullAst, { retainLines: false, compact: false }).code;

  await context.release();
  isolate.dispose();

  // 若没有任何替换成功，也视为失败，回退清壳（避免“看起来成功但没变化”）
  if (replaced === 0) {
    return stripShellKeepMarker(text);
  }
  return out;
}

/* ====== 工具函数 ====== */
function isStaticString(node) {
  return (
    t.isStringLiteral(node) ||
    (t.isTemplateLiteral(node) && node.expressions.length === 0)
  );
}
function evalStaticString(node) {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node)) {
    return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
  }
  return "";
}
function stripShellKeepMarker(input) {
  let code = String(input);
  code = code.replace(
    /;?\s*var\s+encode_version\s*=\s*['"]jsjiami\.com\.v7['"];?/i,
    (m) => m
  );
  code = code.replace(
    /try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g,
    "/* [strip:try-catch-self-check] */"
  );
  code = code.replace(
    /if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g,
    "/* [strip:dead-wrapper] */"
  );
  return code;
}
