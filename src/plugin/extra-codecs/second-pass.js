// ESM 二次解密（动态识别 + 多轮替换，无硬编码）
// 用法：node src/plugin/extra-codecs/second-pass.js <infile> <outfile>

import fs from "fs";
import vm from "vm";
import * as parser from "@babel/parser";
import gen from "@babel/generator";
import traverseMod from "@babel/traverse";
import * as t from "@babel/types";

const traverse = traverseMod.default || traverseMod;

/** 解析成 AST（宽松） */
function parse(code) {
  return parser.parse(code, {
    sourceType: "unambiguous",
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    plugins: [
      "jsx",
      "classProperties",
      "optionalChaining",
      "nullishCoalescingOperator",
      "topLevelAwait",
    ],
  });
}

/** 生成代码 */
const generate = (ast) => gen(ast, { retainLines: false, compact: false }).code;

/** 粗筛“像解码器”的函数：包含 RC4/Base64/解码特征 */
function looksLikeDecoder(fnNode) {
  let src = "";
  try {
    src = generate(fnNode);
  } catch (_) {}
  const hits = [
    /ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\+\/=/,
    /\bdecodeURIComponent\b/,
    /\bfromCharCode\b/,
    /%0x100\b|% 0x100\b|%256\b/,
    /\bcharCodeAt\b.*\^/, // XOR
  ].some((r) => r.test(src));
  return hits;
}

/** 收集候选解码函数名（定义处） */
function collectDecoderDefs(ast) {
  const defs = new Map(); // name -> node
  traverse(ast, {
    FunctionDeclaration(path) {
      const { id } = path.node;
      if (id?.name && looksLikeDecoder(path.node)) defs.set(id.name, path.node);
    },
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (!t.isIdentifier(id)) return;
      if (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) {
        if (looksLikeDecoder(init)) defs.set(id.name, path.node);
      }
    },
  });
  return defs;
}

/** 从调用点反推“解码器候选名”（arg 多为数字/短字串） */
function collectCalleeCandidates(ast) {
  const names = new Set();
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee)) return;
      const args = path.node.arguments;
      if (args.length < 1 || args.length > 3) return;

      const isMostlyLiteral = args.every(
        (a) =>
          t.isNumericLiteral(a) ||
          t.isStringLiteral(a) ||
          t.isBooleanLiteral(a) ||
          t.isNullLiteral(a)
      );
      // 典型模式： (num, shortKey) / (hexIndex, 'key')
      const hasIndexLike =
        args.some((a) => t.isNumericLiteral(a)) ||
        args.some((a) => t.isStringLiteral(a) && /^[0-9a-f]{1,4}$/i.test(a.value));

      if (isMostlyLiteral && hasIndexLike) {
        names.add(callee.name);
      }
    },
  });
  return names;
}

/** 找到标识符定义节点（FunctionDeclaration / VarDeclarator） */
function findDefNodes(ast, name, visited = new Set()) {
  if (visited.has(name)) return [];
  visited.add(name);

  const out = [];
  traverse(ast, {
    enter(p) {
      const n = p.node;
      if (
        t.isFunctionDeclaration(n) &&
        n.id?.name === name
      ) {
        out.push(n);
        p.skip();
      } else if (
        t.isVariableDeclarator(n) &&
        t.isIdentifier(n.id) &&
        n.id.name === name
      ) {
        out.push(n);
        p.skip();
      }
    },
  });

  // 递归收集依赖（被解码器函数体内引用的其它本地函数）
  const more = [];
  for (const node of out) {
    const body = t.isVariableDeclarator(node)
      ? (t.isFunctionExpression(node.init) || t.isArrowFunctionExpression(node.init) ? node.init.body : null)
      : node.body;

    if (!body) continue;

    traverse(t.isBlockStatement(body) ? body : t.blockStatement([t.returnStatement(body)]), {
      Identifier(p2) {
        const nm = p2.node.name;
        if (nm === name) return;
        // 跳过全局保留名
        if (["String", "Array", "RegExp", "Object", "Math", "JSON", "decodeURIComponent"].includes(nm)) return;
        // 查找 nm 的定义
        const found = findDefNodes(ast, nm, visited);
        for (const f of found) more.push(f);
      },
    });
  }
  return [...out, ...more];
}

/** 构造只包含“解码器及依赖”的最小 Program */
function buildMiniProgram(defNodes) {
  const body = [];
  // 去重
  const seen = new Set();
  for (const n of defNodes) {
    const src = generate(t.program([t.isVariableDeclarator(n) ? t.variableDeclaration("var", [n]) : n]));
    if (seen.has(src)) continue;
    seen.add(src);
    body.push(t.isVariableDeclarator(n) ? t.variableDeclaration("var", [n]) : n);
  }
  // 安全的最小全局
  body.unshift(
    parser.parse(`var $request={}, $response={}, $done=function(){}, console = {log(){},error(){}};`, { sourceType: "script" }).program.body[0],
    parser.parse(`var globalThis = this;`, { sourceType: "script" }).program.body[0]
  );
  return t.program(body);
}

/** 在 VM 里执行 mini 程序，然后调用 decoder(args...) 获取值 */
function makeDecoderEval(miniCode, decoderName) {
  const sandbox = {};
  const ctx = vm.createContext(sandbox);
  try {
    vm.runInContext(miniCode, ctx, { timeout: 300 });
  } catch (e) {
    return null; // 无法装载
  }
  return function evalCall(args) {
    try {
      const ser = args
        .map((a) => (typeof a === "string" ? JSON.stringify(a) : String(a)))
        .join(",");
      const expr = `${decoderName}(${ser})`;
      const out = vm.runInContext(expr, ctx, { timeout: 300 });
      return typeof out === "string" ? out : null;
    } catch (_) {
      return null;
    }
  };
}

/** 替换所有调用（一次遍历） */
function replaceCallsOnce(ast, evalMap) {
  let changed = 0;
  traverse(ast, {
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (!t.isIdentifier(callee)) return;
      const ev = evalMap.get(callee.name);
      if (!ev) return;

      // 仅替换全部参数为字面量/可序列化的情况
      const argVals = [];
      for (const a of args) {
        if (t.isStringLiteral(a)) argVals.push(a.value);
        else if (t.isNumericLiteral(a)) argVals.push(a.value);
        else if (t.isBooleanLiteral(a)) argVals.push(a.value);
        else if (t.isNullLiteral(a)) argVals.push(null);
        else return; // 非静态参数，跳过
      }

      const decoded = ev(argVals);
      if (typeof decoded === "string") {
        path.replaceWith(t.stringLiteral(decoded));
        changed++;
      }
    },
  });
  return changed;
}

/** 清理未使用的解码器/提供器（简单：若名不再被引用则删定义） */
function cleanupDefs(ast, names) {
  traverse(ast, {
    Program(path) {
      const used = new Set();
      path.traverse({
        Identifier(p) {
          if (names.has(p.node.name)) used.add(p.node.name);
        },
      });
      path.get("body").forEach((nodePath) => {
        const n = nodePath.node;
        const kill = (idName) => !used.has(idName);
        if (t.isFunctionDeclaration(n) && n.id?.name && names.has(n.id.name) && kill(n.id.name)) {
          nodePath.remove();
        } else if (t.isVariableDeclaration(n)) {
          const rest = n.declarations.filter((d) => !(t.isIdentifier(d.id) && names.has(d.id.name) && kill(d.id.name)));
          if (rest.length === 0) nodePath.remove();
          else if (rest.length !== n.declarations.length) nodePath.replaceWith(t.variableDeclaration(n.kind, rest));
        }
      });
    },
  });
}

/** 主流程：多轮直到收敛 */
function runSecondPass(inputPath, outputPath) {
  const code = fs.readFileSync(inputPath, "utf-8");
  const ast = parse(code);

  // 1) 通过调用点 + 定义双通道识别候选名
  const candFromCalls = collectCalleeCandidates(ast);
  const defMap = collectDecoderDefs(ast); // name -> def node
  // 交集优先，其次并集
  const priority = [...candFromCalls].filter((n) => defMap.has(n));
  const extras = [...defMap.keys()].filter((n) => !candFromCalls.has(n));
  const decoderNames = [...new Set([...priority, ...extras])];

  if (decoderNames.length === 0) {
    console.log("[second-pass] 没发现解码器候选，跳过");
    fs.writeFileSync(outputPath, code, "utf-8");
    return;
  }

  // 2) 为每个解码器构建 mini 程序 + VM 执行器
  const evalMap = new Map();
  for (const name of decoderNames) {
    const defNodes = findDefNodes(ast, name);
    if (defNodes.length === 0) continue;
    const miniAst = buildMiniProgram(defNodes);
    const miniCode = generate(miniAst);
    const ev = makeDecoderEval(miniCode, name);
    if (ev) evalMap.set(name, ev);
  }

  if (evalMap.size === 0) {
    console.log("[second-pass] 候选装载失败（可能有副作用/依赖缺失），跳过");
    fs.writeFileSync(outputPath, code, "utf-8");
    return;
  }

  // 3) 多轮替换
  let total = 0;
  const MAX = 5;
  for (let i = 1; i <= MAX; i++) {
    const changed = replaceCallsOnce(ast, evalMap);
    total += changed;
    console.log(`[second-pass] 第 ${i} 轮替换：${changed} 处`);
    if (changed === 0) break;
  }

  // 4) 如果有替换，清理未用定义
  if (total > 0) {
    cleanupDefs(ast, new Set(evalMap.keys()));
  }

  const out = generate(ast);
  fs.writeFileSync(outputPath, out, "utf-8");
  console.log(`[second-pass] 完成，共替换 ${total} 处 → ${outputPath}`);
}

/** CLI */
if (process.argv.length < 4) {
  console.error("Usage: node src/plugin/extra-codecs/second-pass.js <infile> <outfile>");
  process.exit(2);
}
const [infile, outfile] = process.argv.slice(2);
runSecondPass(infile, outfile);
