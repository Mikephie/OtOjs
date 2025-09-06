// plugins/jsjiami_v7.js
// jsjiami v7：运行期解表 + 自动执行“数组洗牌”引导段 + AST 批量替换（含别名）
// 关键点：不再用脆弱的正则去抠 IIFE，而是把“文件开头到业务起点”的引导代码整体丢进沙箱执行，确保字符串表顺序正确。

import ivm from "isolated-vm";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import generateModule from "@babel/generator";

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

const MAX_SRC_LEN = 2_000_000;

export default async function jsjiamiV7(input) {
  // 仅处理 v7 样本
  if (!/jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(input)) {
    return null;
  }
  const src = String(input).slice(0, MAX_SRC_LEN);

  // 必须包含字符串表与解码器
  if (!/function\s+_0x1715\s*\(\)/.test(src) || !/function\s+_0x1e61\s*\(/.test(src)) {
    return stripShellKeepMarker(input);
  }

  try {
    // —— 1) 提取“引导前缀”：文件开头 → 业务起点（不含业务起点） —— //
    // 常见业务起点是 const opName = ...；可按项目需要调整标记
    const boot = extractBootstrapPrefix(src, /(?:^|\n)\s*(?:const|var|let)\s+opName\b/);
    if (!boot) return stripShellKeepMarker(input);

    // —— 2) 在 isolated-vm 中仅执行引导段，完成表初始化/数组洗牌 —— //
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());

    // 避免引导段意外访问宿主环境：提供最小桩
    const polyfills = `
      var $request = {};
      var $response = {};
      var $done = function(){};
      var console = { log(){}, warn(){}, error(){} };
    `;

    const bootstrap = `
      ${polyfills}
      ${boot}
      // 无害化别名
      try { const _0xc3dd0a = _0x1e61; } catch(e){}
      // 统一的解码桥
      global.__dec = function(a, b) {
        try { return _0x1e61(a, b); } catch (e) { return null; }
      };
    `;
    const script = await isolate.compileScript(bootstrap, { filename: "jjiami-bootstrap.js" });
    await script.run(context, { timeout: 1000 });

    // —— 3) 解析整份源代码，收集所有对解码器（含别名）的调用 —— //
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
        "typescript" // 遇到少量 TS 语法也能过（不会输出 d.ts，纯解析）
      ],
    });

    // 收集 _0x1e61 的别名：const alias = _0x1e61; 以及 alias = _0x1e61;
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
        const { callee, arguments: args } = p.node;
        if (t.isIdentifier(callee) && decoderNames.has(callee.name)) {
          if (
            args.length === 2 &&
            t.isNumericLiteral(args[0]) &&
            (t.isStringLiteral(args[1]) || isStaticString(args[1]))
          ) {
            jobs.push({
              path: p,
              idx: args[0].value,
              key: evalStaticString(args[1]),
            });
          }
        }
      },
    });

    // —— 4) 调用沙箱内 __dec 批量解码并替换为明文字面量 —— //
    let replaced = 0;
    for (const j of jobs) {
      const val = await context.eval(`__dec(${j.idx}, ${JSON.stringify(j.key)})`, { timeout: 200 });
      if (typeof val === "string") {
        j.path.replaceWith(t.stringLiteral(val));
        replaced++;
      }
    }

    // 释放沙箱
    await context.release();
    isolate.dispose();

    // 若完全没有替换，说明引导可能仍不完整，避免产生“看似成功”的假结果
    if (replaced === 0) {
      return stripShellKeepMarker(input);
    }

    // —— 5) 清理无用定义：去掉 _0x1715/_0x1e61/标识变量 —— //
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

    // 输出
    return generate(ast, { retainLines: false, compact: false }).code;
  } catch (e) {
    // console.warn("[jsjiami_v7] failed:", e?.message);
    return stripShellKeepMarker(input);
  }
}

/* ===================== 工具函数 ===================== */

/**
 * 从“文件开头”一直截到“业务起点标记”行（不含该行），得到完整引导段。
 * 默认业务起点标记：出现 opName 的变量定义（可按项目改为更靠后的标记）。
 */
function extractBootstrapPrefix(code, markerRegex) {
  const m = code.match(markerRegex);
  if (!m) return null;
  const end = m.index;                 // 截到标记行开始
  const prefix = code.slice(0, end);
  // 防御：确保引导段内包含 _0x1715/_0x1e61，避免误截太短
  if (!/function\s+_0x1715\s*\(\)/.test(prefix) || !/function\s+_0x1e61\s*\(/.test(prefix)) {
    return null;
  }
  return prefix;
}

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
  // 保留版本标识但清理自检/死代码包装，便于后续人工/其它 pass 处理
  code = code.replace(/;?\s*var\s+encode_version\s*=\s*['"]jsjiami\.com\.v7['"];?/i, (m) => m);
  code = code.replace(/try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g, "/* [strip:try-catch-self-check] */");
  code = code.replace(/if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g, "/* [strip:dead-wrapper] */");
  return code;
}
