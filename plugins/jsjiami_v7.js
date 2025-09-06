// plugins/jsjiami_v7.js
// jsjiami v7：自动探测“引导段”并在沙箱执行（完成数组洗牌/表初始化）
// + AST 批量替换（支持变量别名、对象属性别名、括号/逗号脱 this、call/apply、计算属性）
// + 轻量常量折叠（"A" + "B"）
// 说明：不依赖固定业务标记，更适配多样化加密写法

import ivm from "isolated-vm";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import generateModule from "@babel/generator";

const traverse = traverseModule.default || traverseModule;
const generate = generateModule.default || generateModule;

const MAX_SRC_LEN = 2_000_000;

/* ========== 自动探测：找到足以让 _0x1e61 可用的前缀，引导初始化 ========== */
async function probeUsableDecoder(prefix) {
  const isolate = new ivm.Isolate({ memoryLimit: 32 });
  const context = await isolate.createContext();
  const jail = context.global;
  await jail.set("global", jail.derefInto());

  const polyfills = `
    var $request = {};
    var $response = {};
    var $done = function(){};
    var console = { log(){}, warn(){}, error(){} };
  `;

  const boot = `
    ${polyfills}
    ${prefix}
    try { global.__probe_ok = (typeof _0x1e61 === 'function'); } catch(e){ global.__probe_ok = false; }
  `;
  try {
    const script = await isolate.compileScript(boot, { filename: "probe.js" });
    await script.run(context, { timeout: 600 });
    const ok = await context.eval("global.__probe_ok === true", { timeout: 100 });
    try { await context.release(); } catch {}
    isolate.dispose();
    return !!ok;
  } catch {
    try { await context.release(); } catch {}
    isolate.dispose();
    return false;
  }
}

async function extractBootstrapPrefix(code) {
  const i1715 = code.indexOf("function _0x1715");
  const i1e61 = code.indexOf("function _0x1e61");
  if (i1715 < 0 || i1e61 < 0) return null;

  const lines = code.split(/\r?\n/);
  const base = Math.max(
    Math.max(0, code.slice(0, i1715).split(/\r?\n/).length - 1),
    Math.max(0, code.slice(0, i1e61).split(/\r?\n/).length - 1)
  );

  let end = Math.min(lines.length, base + 30);
  const maxEnd = Math.min(lines.length, base + 900);

  while (end <= maxEnd) {
    const prefix = lines.slice(0, end).join("\n");
    if (/function\s+_0x1715\s*\(/.test(prefix) && /function\s+_0x1e61\s*\(/.test(prefix)) {
      const ok = await probeUsableDecoder(prefix);
      if (ok) return prefix;
    }
    end += 10;
  }
  return null;
}

/* ========== 主导出：解码 v7 ========== */
export default async function jsjiamiV7(input) {
  if (!/jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(input)) {
    return null;
  }
  const src = String(input).slice(0, MAX_SRC_LEN);

  if (!/function\s+_0x1715\s*\(\)/.test(src) || !/function\s+_0x1e61\s*\(/.test(src)) {
    return stripShellKeepMarker(input);
  }

  try {
    // 1) 自动探测引导段并执行
    const boot = await extractBootstrapPrefix(src);
    if (!boot) return stripShellKeepMarker(input);

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
    await script.run(context, { timeout: 1200 });

    // 2) 解析整源
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

    // 3) 收集别名（变量 & 对象属性）
    const decoderNames = new Set(["_0x1e61"]);
    const decoderPropBinds = new Set(); // "obj#prop"

    traverse(ast, {
      VariableDeclarator(p) {
        const { id, init } = p.node;
        if (t.isIdentifier(id) && t.isIdentifier(init, { name: "_0x1e61" })) {
          decoderNames.add(id.name);
        }
      },
      AssignmentExpression(p) {
        const { left, right, operator } = p.node;
        if (operator !== "=") return;

        if (t.isIdentifier(right, { name: "_0x1e61" }) && t.isIdentifier(left)) {
          decoderNames.add(left.name);
          return;
        }
        if (
          t.isIdentifier(right, { name: "_0x1e61" }) &&
          t.isMemberExpression(left) &&
          t.isIdentifier(left.object)
        ) {
          if (!left.computed && t.isIdentifier(left.property)) {
            decoderPropBinds.add(`${left.object.name}#${left.property.name}`);
          } else if (left.computed && isStaticString(left.property)) {
            decoderPropBinds.add(`${left.object.name}#${evalStaticString(left.property)}`);
          }
        }
      },
    });

    // 4) 收集待替换调用（五类）
    const jobs = [];

    function isStaticString(node) {
      if (t.isStringLiteral(node)) return true;
      if (t.isTemplateLiteral(node) && node.expressions.length === 0) return true;
      if (t.isBinaryExpression(node, { operator: "+" })) {
        return isStaticString(node.left) && isStaticString(node.right);
      }
      return false;
    }
    function evalStaticString(node) {
      if (t.isStringLiteral(node)) return node.value;
      if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
        return node.quasis.map(q => q.value.cooked ?? q.value.raw).join("");
      }
      if (t.isBinaryExpression(node, { operator: "+" })) {
        return evalStaticString(node.left) + evalStaticString(node.right);
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
        if (args.length >= 3) return { idx: args[1], key: args[2] };
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

        // 1) alias(idx, key) / (0,alias)(...)
        const name = extractCalleeIdent(callee);
        if (name && decoderNames.has(name)) {
          if (args.length === 2 && t.isNumericLiteral(args[0]) && isStaticString(args[1])) {
            jobs.push({ path: p, idx: args[0].value, key: evalStaticString(args[1]) });
          }
          return;
        }

        if (t.isMemberExpression(callee)) {
          // 2) alias.call/apply(...)
          let obj = callee.object;
          while (t.isParenthesizedExpression(obj)) obj = obj.expression;
          const baseName = extractCalleeIdent(obj);

          if (
            baseName && decoderNames.has(baseName) &&
            t.isIdentifier(callee.property) &&
            (callee.property.name === "call" || callee.property.name === "apply")
          ) {
            const extracted = extractCallApplyArgs(callee, args);
            if (
              extracted &&
              t.isNumericLiteral(extracted.idx) &&
              isStaticString(extracted.key)
            ) {
              jobs.push({
                path: p,
                idx: extracted.idx.value,
                key: evalStaticString(extracted.key),
              });
            }
            return;
          }

          // 3) 对象属性直调：obj.dec(idx,key) / obj['dec'](...)
          let objName = null;
          if (t.isIdentifier(callee.object)) objName = callee.object.name;
          if (!objName) return;

          let propName = null;
          if (!callee.computed && t.isIdentifier(callee.property)) {
            propName = callee.property.name;
          } else if (callee.computed && isStaticString(callee.property)) {
            propName = evalStaticString(callee.property);
          }
          if (!propName) return;

          if (decoderPropBinds.has(`${objName}#${propName}`)) {
            if (args.length === 2 && t.isNumericLiteral(args[0]) && isStaticString(args[1])) {
              jobs.push({ path: p, idx: args[0].value, key: evalStaticString(args[1]) });
            }
          }
        }
      },
    });

    console.log("[v7] jobs collected:", jobs.length);

    // 5) 解码并替换
    let replaced = 0;
    for (const j of jobs) {
      const val = await context.eval(`__dec(${j.idx}, ${JSON.stringify(j.key)})`, { timeout: 250 });
      if (typeof val === "string") {
        j.path.replaceWith(t.stringLiteral(val));
        replaced++;
      }
    }
    console.log("[v7] replaced:", replaced);

    try { await context.release(); } catch {}
    isolate.dispose();

    if (replaced === 0) {
      return stripShellKeepMarker(input);
    }

    // 6) 清理无用定义
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

/* ========== 清理包装但保留版本标识 ========== */
function stripShellKeepMarker(input) {
  let code = String(input);
  code = code.replace(/;?\s*var\s+encode_version\s*=\s*['"]jsjiami\.com\.v7['"];?/i, (m) => m);
  code = code.replace(/try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g, "/* [strip:self-check] */");
  code = code.replace(/if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g, "/* [strip:dead-wrapper] */");
  return code;
}
