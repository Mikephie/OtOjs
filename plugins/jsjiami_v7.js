// plugins/jsjiami_v7.js
// jsjiami v7：运行期解表 + 执行“数组洗牌 IIFE” + AST 文字化替换（含别名）
// 关键修复：必须在沙箱中执行那段自执行 IIFE，否则字符串表顺序不对，解出来是乱码。
import ivm from "isolated-vm";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import generateModule from "@babel/generator";

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

const MAX_SRC_LEN = 2_000_000;

export default async function jsjiamiV7(input) {
  if (!/jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(input)) {
    return null;
  }
  const src = input.length > MAX_SRC_LEN ? input.slice(0, MAX_SRC_LEN) : String(input);

  if (!/function\s+_0x1715\s*\(\)/.test(src) || !/function\s+_0x1e61\s*\(/.test(src)) {
    return stripShellKeepMarker(input);
  }

  try {
    const f1715 = extractFunc(src, "_0x1715");
    const f1e61 = extractFunc(src, "_0x1e61");
    const iife = extractShuffleIIFE(src); // ★ 新增：提取“数组洗牌 IIFE”
    if (!f1715 || !f1e61 || !iife) return stripShellKeepMarker(input);

    // —— 在 isolated-vm 里只执行解码相关 —— //
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());

    // 只注入必须的全局，避免触发业务逻辑
    const bootstrap = `
      var _0xodH = "jsjiami.com.v7";
      ${f1715}
      ${f1e61}
      // 有些样本会用别名指向 _0x1e61，这里给出等价别名，解码时不一定需要，但无害
      try { const _0xc3dd0a = _0x1e61; } catch (e) {}
      // ★ 执行“数组洗牌 IIFE”，修正字符串表顺序
      (function(){ ${iife} })();
      // 提供统一的解码桥
      global.__dec = function(a, b) {
        try { return _0x1e61(a, b); } catch (e) { return null; }
      };
    `;
    const script = await isolate.compileScript(bootstrap, { filename: "jjiami-bootstrap.js" });
    await script.run(context, { timeout: 800 });

    // 解析整份源
    const ast = parse(input, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
    });

    // 收集 _0x1e61 的别名
    const decoderNames = new Set(["_0x1e61"]);
    traverse(ast, {
      VariableDeclarator(p) {
        const id = p.node.id, init = p.node.init;
        if (t.isIdentifier(id) && t.isIdentifier(init, { name: "_0x1e61" })) decoderNames.add(id.name);
      },
      AssignmentExpression(p) {
        const { left, right, operator } = p.node;
        if (operator === "=" && t.isIdentifier(right, { name: "_0x1e61" }) && t.isIdentifier(left)) {
          decoderNames.add(left.name);
        }
      },
    });

    // 收集所有待替换调用
    const jobs = [];
    traverse(ast, {
      CallExpression(p) {
        const callee = p.node.callee;
        if (t.isIdentifier(callee) && decoderNames.has(callee.name)) {
          const args = p.node.arguments;
          if (
            args.length === 2 &&
            t.isNumericLiteral(args[0]) &&
            (t.isStringLiteral(args[1]) || isStaticString(args[1]))
          ) {
            const idx = args[0].value;
            const key = evalStaticString(args[1]);
            jobs.push({ path: p, idx, key });
          }
        }
      },
    });

    // 解码并替换
    for (const job of jobs) {
      const val = await context.eval(`__dec(${job.idx}, ${JSON.stringify(job.key)})`, { timeout: 120 });
      if (typeof val === "string") {
        job.path.replaceWith(t.stringLiteral(val));
      }
    }

    // 移除无用定义
    const toRemove = new Set(["_0x1715", "_0x1e61"]);
    traverse(ast, {
      FunctionDeclaration(p) {
        const name = p.node.id?.name;
        if (name && toRemove.has(name)) p.remove();
      },
      VariableDeclarator(p) {
        const id = p.node.id;
        if (t.isIdentifier(id) && /^(version_|encode_version|_0xodH)$/.test(id.name)) p.remove();
      },
    });

    const out = generate(ast, { retainLines: false, compact: false }).code;
    await context.release();
    isolate.dispose();
    return out;
  } catch (e) {
    // console.warn("[jsjiami_v7] fail:", e?.message);
    return stripShellKeepMarker(input);
  }
}

/* ====== 辅助：提取函数 & IIFE ====== */
// 提取 function 名称的源码块
function extractFunc(code, name) {
  const start = code.indexOf(`function ${name}`);
  if (start < 0) return null;
  const sub = code.slice(start);
  const openIdx = sub.indexOf("{");
  if (openIdx < 0) return null;
  let depth = 0;
  for (let i = openIdx; i < sub.length; i++) {
    const ch = sub[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return sub.slice(0, i + 1);
    }
  }
  return null;
}

// ★ 提取并还原“数组洗牌 IIFE”源码，返回可直接执行的一段代码
function extractShuffleIIFE(code) {
  // 典型样式：if ((function(...) { ... })(0x3340, 0xc4ab3, _0x1715, 0xcf), _0x1715) { }
  // 我们需要拿到 "(function(...) { ... })(0x..., 0x..., _0x1715, ...);" 这一段去执行
  const m = code.match(/if\s*\(\s*\(\s*function\s*\([\s\S]*?\)\s*\{[\s\S]*?\}\s*\)\s*\([\s\S]*?\)\s*,\s*_0x1715\)\s*\)\s*\{/);
  if (!m) {
    // 有些变体前后略不同，退一步再找
    const m2 = code.match(/\(\s*function\s*\([\s\S]*?\)\s*\{[\s\S]*?\}\s*\)\s*\([\s\S]*?\)\s*,\s*_0x1715\)/);
    if (!m2) return null;
    return m2[0].replace(/\)\s*,\s*_0x1715\)\s*$/, ");"); // 去掉逗号后的部分，留下纯 IIFE 调用
  }
  // 从 if( (function(...) {...})(args), _0x1715) { 截出 IIFE 调用
  const chunk = m[0];
  const callMatch = chunk.match(/\(\s*function\s*\([\s\S]*?\)\s*\{[\s\S]*?\}\s*\)\s*\([\s\S]*?\)/);
  if (!callMatch) return null;
  return callMatch[0] + ";";
}

/* ====== 其它工具 ====== */
function isStaticString(node) {
  return t.isStringLiteral(node) || (t.isTemplateLiteral(node) && node.expressions.length === 0);
}
function evalStaticString(node) {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis.map(q => q.value.cooked ?? q.value.raw).join("");
  }
  return "";
}

function stripShellKeepMarker(input) {
  let code = String(input);
  code = code.replace(/;?\s*var\s+encode_version\s*=\s*['"]jsjiami\.com\.v7['"];?/i, (m) => m);
  code = code.replace(/try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g, "/* [strip:try-catch-self-check] */");
  code = code.replace(/if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g, "/* [strip:dead-wrapper] */");
  return code;
}
