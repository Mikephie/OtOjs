// plugins/jsjiami_v7.js
// jsjiami v7：运行期解表 + 自动执行“引导段（含数组洗牌）” + AST 批量替换（含别名/间接调用）
// 关键点：把“文件开头到业务起点”的引导代码整体丢进沙箱执行，确保字符串表顺序正确。
// 并增强识别：支持 (0, alias)(...), alias.call/apply(...)

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
  const src = String(input).slice(0, MAX_SRC_LEN);

  if (!/function\s+_0x1715\s*\(\)/.test(src) || !/function\s+_0x1e61\s*\(/.test(src)) {
    return stripShellKeepMarker(input);
  }

  try {
    const boot = extractBootstrapPrefix(src, /(?:^|\n)\s*(?:const|var|let)\s+opName\b/);
    if (!boot) return stripShellKeepMarker(input);

    // 沙箱：仅执行引导段，初始化表、密钥与解码器
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());

    const polyfills = `
      var $request = {};
      var $response = {};
      var $done = function(){};
      var console = { log(){}, warn(){}, error(){} };
    `;

    const bootstrap = `
      ${polyfills}
      ${boot}
      try { const _0xc3dd0a = _0x1e61; } catch(e){}
      global.__dec = function(a, b) {
        try { return _0x1e61(a, b); } catch (e) { return null; }
      };
    `;
    const script = await isolate.compileScript(bootstrap, { filename: "jjiami-bootstrap.js" });
    await script.run(context, { timeout: 1000 });

    // 解析整份源
    const ast = parse(src, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: [
        "jsx",
        "classProperties",
        "optionalChaining",
        "dynamicImport",
        "classStaticBlock",
        "topLevelAwait",
        "typescript",
      ],
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

    // —— 收集所有待替换调用（增强：支持 (0, alias)(...), alias.call/apply(...) 等） —— //
    const jobs = [];

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
    function extractCalleeIdent(node) {
      while (node && node.type === "ParenthesizedExpression") node = node.expression;
      if (node && node.type === "SequenceExpression" && node.expressions?.length) {
        return extractCalleeIdent(node.expressions[node.expressions.length - 1]);
      }
      if (node && node.type === "Identifier") return node.name;
      return null;
    }
    function extractCallApplyArgs(memberExpr, args) {
      const prop = memberExpr.property;
      if (prop && prop.type === "Identifier" && prop.name === "call") {
        if (args.length >= 3) return { idx: args[1], key: args[2] }; // 跳过 thisArg
        return null;
      }
      if (prop && prop.type === "Identifier" && prop.name === "apply") {
        if (args.length >= 2 && args[1] && args[1].type === "ArrayExpression") {
          const arr = args[1].elements || [];
          if (arr.length >= 2) return { idx: arr[0], key: arr[1] };
        }
        return null;
      }
      return null;
    }

    traverse(ast, {
      CallExpression(p) {
        const call = p.node;
        const { callee, arguments: args } = call;

        // 1) 直接/间接（括号、逗号）调用：alias(idx, key)
        const name = extractCalleeIdent(callee);
        if (name && decoderNames.has(name)) {
          if (args.length === 2 && t.isNumericLiteral(args[0]) && (t.isStringLiteral(args[1]) || isStaticString(args[1]))) {
            jobs.push({ path: p, idx: args[0].value, key: evalStaticString(args[1]) });
          }
          return;
        }

        // 2) alias.call/apply(...)
        if (t.isMemberExpression(callee)) {
          let obj = callee.object;
          while (t.isParenthesizedExpression(obj)) obj = obj.expression;
          const objName = extractCalleeIdent(obj);
          if (objName && decoderNames.has(objName)) {
            const extracted = extractCallApplyArgs(callee, args);
            if (
              extracted &&
              t.isNumericLiteral(extracted.idx) &&
              (t.isStringLiteral(extracted.key) || isStaticString(extracted.key))
            ) {
              jobs.push({
                path: p,
                idx: extracted.idx.value,
                key: evalStaticString(extracted.key),
              });
            }
          }
        }
      },
    });

    console.log("[v7] jobs collected:", jobs.length);

    // —— 解码并替换 —— //
    let replaced = 0;
    for (const j of jobs) {
      const val = await context.eval(`__dec(${j.idx}, ${JSON.stringify(j.key)})`, { timeout: 200 });
      if (typeof val === "string") {
        j.path.replaceWith(t.stringLiteral(val));
        replaced++;
      }
    }
    console.log("[v7] replaced:", replaced);

    await context.release();
    isolate.dispose();

    if (replaced === 0) {
      return stripShellKeepMarker(input);
    }

    // 清理无用定义
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

    return generate(ast, { retainLines: false, compact: false }).code;
  } catch (e) {
    // console.warn("[jsjiami_v7] failed:", e?.message);
    return stripShellKeepMarker(input);
  }
}

/* ========== 工具函数 ========== */
function extractBootstrapPrefix(code, markerRegex) {
  const m = code.match(markerRegex);
  if (!m) return null;
  const end = m.index;
  const prefix = code.slice(0, end);
  if (!/function\s+_0x1715\s*\(\)/.test(prefix) || !/function\s+_0x1e61\s*\(/.test(prefix)) {
    return null;
  }
  return prefix;
}

function stripShellKeepMarker(input) {
  let code = String(input);
  code = code.replace(/;?\s*var\s+encode_version\s*=\s*['"]jsjiami\.com\.v7['"];?/i, (m) => m);
  code = code.replace(/try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g, "/* [strip:try-catch-self-check] */");
  code = code.replace(/if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g, "/* [strip:dead-wrapper] */");
  return code;
}
