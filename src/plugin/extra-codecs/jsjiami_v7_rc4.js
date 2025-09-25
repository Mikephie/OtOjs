// plugin/jsjiami_v7_rc4.js —— 专门处理 jsjiami v7 RC4 字符串解码
// 思路：收集 _0x1e61 及别名调用，直接在 Node VM 中跑 RC4 函数，替换返回的明文

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";
import vm from "vm";

// 递归收集别名
function collectAliases(ast) {
  const pointsTo = new Map(); // name -> initName
  const decoderRoots = new Set(["_0x1e61"]);

  (traverse.default || traverse)(ast, {
    VariableDeclarator(p) {
      const id = p.node.id;
      const init = p.node.init;
      if (t.isIdentifier(id) && t.isIdentifier(init)) {
        pointsTo.set(id.name, init.name);
      }
    },
  });

  const aliases = new Set([...decoderRoots]);
  for (const [name] of pointsTo) {
    let cur = name, hop = 0, ok = false;
    while (pointsTo.has(cur) && hop < 10) {
      cur = pointsTo.get(cur);
      hop++;
      if (decoderRoots.has(cur)) { ok = true; break; }
    }
    if (ok) aliases.add(name);
  }
  return aliases;
}

// 尝试解析索引（数字 / hex / -num）
function parseIndex(node) {
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isStringLiteral(node) && /^0x/i.test(node.value)) return parseInt(node.value, 16);
  if (t.isUnaryExpression(node) && node.operator === "-" && t.isNumericLiteral(node.argument))
    return -node.argument.value;
  if (t.isStringLiteral(node)) return Number(node.value);
  return NaN;
}

export default function jsjiamiV7Rc4Plugin(source, ctx = {}) {
  const ast = parser.parse(source, { sourceType: "unambiguous" });
  const aliases = collectAliases(ast);

  let replaced = 0;

  // 先收集原始解码函数源码
  let decoderSrc = "";
  (traverse.default || traverse)(ast, {
    FunctionDeclaration(p) {
      if (aliases.has(p.node.id?.name)) {
        decoderSrc = generate.default(p.node).code;
      }
    },
  });

  if (!decoderSrc) {
    ctx.notes?.push?.("jsjiami_v7_rc4: decoder not available");
    return source;
  }

  const sandbox = {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(decoderSrc, sandbox);
  } catch (e) {
    ctx.notes?.push?.(`jsjiami_v7_rc4: bootstrap failed: ${e.message}`);
    return source;
  }

  // 替换调用
  (traverse.default || traverse)(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (t.isIdentifier(callee) && aliases.has(callee.name)) {
        const args = p.node.arguments;
        if (!args.length) return;
        const idx = parseIndex(args[0]);
        if (isNaN(idx)) return;
        try {
          const fn = sandbox[callee.name];
          const val = fn(idx, args[1] && t.isStringLiteral(args[1]) ? args[1].value : "r@dH");
          if (typeof val === "string") {
            p.replaceWith(t.stringLiteral(val));
            replaced++;
          }
        } catch (_) { /* ignore */ }
      }
    },
  });

  if (replaced > 0) {
    ctx.notes?.push?.(`jsjiami_v7_rc4: replaced ${replaced} calls via sandbox`);
    return (generate.default || generate)(ast, { compact: false }).code;
  }
  return source;
}