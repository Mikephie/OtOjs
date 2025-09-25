// plugin/extra-codecs/jsjiami_v7_rc4.js
// jsjiami.com.v7 变体：在沙箱执行整段脚本初始化 _0x1715/_0x1e61，
// 然后用 AST 将 _0x1e61(...) 及其别名调用替换为明文。

import vm from "vm";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";

// 统一的 parse / print（ESM 兼容）
const parse = (code) =>
  parser.parse(code, {
    sourceType: "unambiguous",
    plugins: ["jsx", "classProperties", "optionalChaining"],
  });
const print = (ast) => (generate.default || generate)(ast).code;

// 安全沙箱：stub 常见全局，避免脚本副作用
function runInSandbox(src, extra = {}) {
  const sandbox = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    $done() {},
    $request: {},
    $response: {},
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    escape: (s) => encodeURIComponent(s).replace(/%20/g, "+"),
    unescape: (s) => decodeURIComponent(s.replace(/\+/g, "%20")),
    globalThis: null,
    ...Object.create(null),
    ...extra,
  });
  sandbox.globalThis = sandbox;
  vm.runInContext(src, sandbox, { timeout: 2000 });
  return sandbox;
}

// 备用：只注入函数声明的方式（当整段执行失败时）
function buildFnsBootstrap(code) {
  const keyDecl =
    (code.match(/var\s+_0xodH\s*=\s*['"][^'"]+['"]\s*;/) || [])[0] || "";
  const tableDecl =
    (code.match(/function\s+_0x1715\s*\([^)]*\)\s*{[\s\S]+?}\s*;/) || [])[0] ||
    (code.match(/function\s+_0x1715\s*\([^)]*\)\s*{[\s\S]+?}\s*/) || [])[0] ||
    "";
  const decDecl =
    (code.match(/function\s+_0x1e61\s*\([^)]*\)\s*{[\s\S]+?}\s*;/) || [])[0] ||
    (code.match(/function\s+_0x1e61\s*\([^)]*\)\s*{[\s\S]+?}\s*/) || [])[0] ||
    "";

  return `
${keyDecl}
${tableDecl}
${decDecl}
globalThis.__TABLE__ = (typeof _0x1715 === 'function') ? _0x1715() : [];
globalThis.__DEC__   = (typeof _0x1e61 === 'function') ? _0x1e61   : null;
`;
}

// 收集 _0x1e61 的别名（只做一层别名追溯）
function collectAliases(ast) {
  const alias = new Set(["_0x1e61"]);
  (traverse.default || traverse)(ast, {
    VariableDeclarator(p) {
      const id = p.node.id;
      const init = p.node.init;
      if (t.isIdentifier(id) && t.isIdentifier(init, { name: "_0x1e61" })) {
        alias.add(id.name);
      }
    },
  });
  return alias;
}

// 替换调用：_0x1e61(idx, key) / 别名(idx, key)
function replaceDecoderCalls(ast, aliases, decodeOne) {
  let count = 0;
  (traverse.default || traverse)(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      if (!t.isIdentifier(callee)) return;
      if (!aliases.has(callee.name)) return;

      const args = p.node.arguments;
      if (args.length < 2) return;
      const [a0, a1] = args;
      if (!(t.isNumericLiteral(a0) || t.isStringLiteral(a0))) return;
      if (!t.isStringLiteral(a1)) return;

      try {
        const idx = t.isNumericLiteral(a0)
          ? a0.value
          : /^0x/i.test(a0.value)
          ? parseInt(a0.value, 16)
          : Number(a0.value);
        const key = a1.value;
        const val = decodeOne(idx, key);
        if (typeof val === "string") {
          p.replaceWith(t.stringLiteral(val));
          count++;
        }
      } catch {}
    },
  });
  return count;
}

export default async function jsjiamiV7Rc4(source, ctx = {}) {
  if (!/jsjiami\.com\.v7/.test(source)) return source;

  // 1) 优先：在沙箱执行整段源码，直接拿函数
  let sandbox = null;
  try {
    sandbox = runInSandbox(source);
  } catch (e) {
    ctx.notes?.push?.(`jsjiami_v7_rc4: run full failed: ${e.message}`);
  }

  // 2) 失败则回退到“仅注入函数声明”的方式
  if (!sandbox || typeof sandbox._0x1e61 !== "function") {
    try {
      sandbox = runInSandbox(buildFnsBootstrap(source));
    } catch (e) {
      ctx.notes?.push?.(`jsjiami_v7_rc4: bootstrap failed: ${e.message}`);
      return source;
    }
  }

  const DEC = sandbox._0x1e61 || sandbox.__DEC__;
  if (typeof DEC !== "function") {
    ctx.notes?.push?.("jsjiami_v7_rc4: decoder not available");
    return source;
  }

  const ast = parse(source);
  const aliases = collectAliases(ast);
  const replaced = replaceDecoderCalls(ast, aliases, (i, k) => DEC(i, k));

  if (replaced > 0) {
    ctx.notes?.push?.(`jsjiami_v7_rc4: replaced ${replaced} calls via sandbox`);
    return print(ast);
  }
  return source;
}