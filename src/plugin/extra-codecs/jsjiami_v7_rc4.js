// plugin/extra-codecs/jsjiami_v7_rc4.js
// 专门处理 jsjiami.com.v7 RC4 变体（支持 RC4 解密 & AST 替换）

import * as t from "@babel/types";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import { parse } from "@babel/parser";
import vm from "vm";

/**
 * 在沙箱里执行代码并返回 sandbox 对象
 */
function inSandboxEval(src, context = {}) {
  const sandbox = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    $done() {}, $request: {}, $response: {},
    // base64 & escape 垫片
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    escape: (s) => encodeURIComponent(s).replace(/%20/g, "+"),
    unescape: (s) => decodeURIComponent(s.replace(/\+/g, "%20")),
    globalThis: null,
    ...Object.create(null),
    ...context,
  });
  sandbox.globalThis = sandbox;
  vm.runInContext(src, sandbox, { timeout: 1500 });
  return { sandbox };
}

/**
 * 构造启动代码：执行 IIFE 并暴露 __TABLE__ / __DEC__ 到沙箱
 */
function buildBootstrap(pieces) {
  return `
${pieces.keyDecl || ""}
${pieces.tableDecl}
${pieces.decoderDecl}
(function(){
  try { ${pieces.iifeBootstrap} } catch(e){}
})();

globalThis.__TABLE__ = (typeof _0x1715 === 'function') ? _0x1715() : [];
globalThis.__DEC__   = (typeof _0x1e61 === 'function') ? _0x1e61 : null;
`;
}

/**
 * 插件入口
 */
export default async function jsjiamiV7Rc4Plugin(code, ctx = {}) {
  try {
    if (!/jsjiami\.com\.v7/.test(code)) return code;

    // 提取关键片段
    const keyDecl = (code.match(/var\s+_0xodH\s*=\s*['"][^'"]+['"]/) || [])[0] || "";
    const tableDecl = (code.match(/function\s+_0x1715\s*\([^)]*\)\s*{[^}]+}/) || [])[0] || "";
    const decoderDecl = (code.match(/function\s+_0x1e61\s*\([^)]*\)\s*{[\s\S]+?};/) || [])[0] || "";
    const iifeBootstrap = (code.match(/if\s*\(\s*function\s*\([^)]*\)\s*{[\s\S]+?}\([^)]*\)\s*,\s*_0x1715\)\s*{}/) || [])[0] || "";

    if (!tableDecl || !decoderDecl) {
      ctx.notes?.push?.("jsjiami_v7_rc4: 缺少必要的字符串表或解码函数");
      return code;
    }

    // 执行沙箱，拿到解码函数
    let DEC = null;
    try {
      const { sandbox } = inSandboxEval(buildBootstrap({ keyDecl, tableDecl, decoderDecl, iifeBootstrap }));
      DEC = sandbox.__DEC__;
    } catch (e) {
      ctx.notes?.push?.(`jsjiami_v7_rc4: bootstrap failed: ${e.message}`);
      return code;
    }
    if (typeof DEC !== "function") {
      ctx.notes?.push?.("jsjiami_v7_rc4: decoder not available");
      return code;
    }

    // AST 解析
    const ast = parse(code, { sourceType: "unambiguous", plugins: ["optionalChaining"] });
    let replaced = 0;

    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;
        if (t.isIdentifier(callee) && (callee.name === "_0x1e61" || callee.name === "_0xc3dd0a")) {
          const args = path.node.arguments;
          if (args.length >= 2 && t.isNumericLiteral(args[0]) && t.isStringLiteral(args[1])) {
            try {
              const val = DEC(args[0].value, args[1].value);
              path.replaceWith(t.stringLiteral(val));
              replaced++;
            } catch (_) {}
          }
        }
      }
    });

    ctx.notes?.push?.(`jsjiami_v7_rc4: replaced ${replaced} decoder calls via sandbox`);

    return generate(ast, { compact: false }).code;
  } catch (e) {
    ctx.notes?.push?.(`jsjiami_v7_rc4 failed: ${e.message}`);
    return code;
  }
}