// plugin/extra-codecs/jsjiami_v7_rc4.js
// 通过沙箱复用原始 _0x1715/_0x1e61，并执行顶层 IIFE 初始化字符串表；
// 然后把 _0x1e61(...) 及其别名调用替换为明文。
// ESM 版本

import vm from 'node:vm';
import parser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import generate from '@babel/generator';

const parse = (code) =>
  parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'classProperties', 'optionalChaining'],
  });
const print = (ast) => generate.default(ast).code;

function inSandboxEval(src, context = {}) {
  const sandbox = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    $done() {},
    $request: {},
    $response: {},
    globalThis: {},
    ...Object.create(null),
    ...context,
  });
  return vm.runInContext(src, sandbox, { timeout: 1500 });
}

function collectPieces(code) {
  const ast = parse(code);
  let hasTable = false;
  let hasDecoder = false;
  let tableDecl = ''; // function _0x1715(){...}
  let decoderDecl = ''; // function _0x1e61(a,b){...}
  let aliasIds = new Set(); // e.g. const _0xc3dd0a = _0x1e61;

  traverse.default(ast, {
    FunctionDeclaration(p) {
      const name = p.node.id?.name;
      if (name === '_0x1715') {
        hasTable = true;
        tableDecl = print(p.node);
      }
      if (name === '_0x1e61') {
        hasDecoder = true;
        decoderDecl = print(p.node);
      }
    },
    VariableDeclarator(p) {
      // const _0xc3dd0a = _0x1e61;
      if (
        t.isIdentifier(p.node.id) &&
        t.isIdentifier(p.node.init, { name: '_0x1e61' })
      ) {
        aliasIds.add(p.node.id.name);
      }
    },
  });

  // 提取 jsjiami 关键字/密钥
  // 例如：var _0xodH = 'jsjiami.com.v7'
  let keyDecl = '';
  const keyMatch = code.match(/var\s+_0xodH\s*=\s*['"]([^'"]+)['"]/);
  if (keyMatch) {
    keyDecl = `var _0xodH=${JSON.stringify(keyMatch[1])};`;
  }

  // 提取并保留“顶层 IIFE 旋转器”那一段，常见模式：
  // if(function(...){ ... }(0x..., 0x..., _0x1715, 0xcf), _0x1715){}
  // 我们不精确匹配，直接在沙箱里 eval 全文即可（有超时与空对象环境）。
  const iifeBootstrap = code;

  return {
    ok: hasTable && hasDecoder,
    tableDecl,
    decoderDecl,
    keyDecl,
    iifeBootstrap,
    aliasIds,
  };
}

function buildBootstrap(pieces) {
  // 顺序：密钥 → 表函数 → 解码器 → 执行全文（让 IIFE 旋转生效）→ 暴露接口
  // 注意：eval 全文前已提供 $request/$response/$done 的空实现，避免脚本报错。
  return `
${pieces.keyDecl || ''}
${pieces.tableDecl}
${pieces.decoderDecl}
(function(){ try { ${pieces.iifeBootstrap} } catch(e) {} })();

try { globalThis.__TABLE__ = _0x1715(); } catch(e){ globalThis.__TABLE__ = []; }
globalThis.__DEC__ = (typeof _0x1e61 === 'function') ? _0x1e61 : null;
`;
}

function isAliasOf(calleePath, targetName) {
  const name = calleePath.node.name;
  if (!name || name === targetName) return false;
  const binding = calleePath.scope.getBinding(name);
  if (!binding || !binding.path?.isVariableDeclarator()) return false;
  const init = binding.path.node.init;
  return t.isIdentifier(init, { name: targetName });
}

function replaceDecoderCalls(ast, decodeOne) {
  traverse.default(ast, {
    CallExpression(p) {
      const callee = p.node.callee;

      // 命中 _0x1e61(...) 或其别名
      let hit = false;
      if (t.isIdentifier(callee, { name: '_0x1e61' })) hit = true;
      else if (t.isIdentifier(callee) && isAliasOf(p.get('callee'), '_0x1e61')) hit = true;
      if (!hit) return;

      // 需要两个参数：索引、密钥
      const args = p.node.arguments;
      if (args.length < 2) return;
      const [a0, a1] = args;
      if (!(t.isNumericLiteral(a0) || t.isStringLiteral(a0))) return;
      if (!t.isStringLiteral(a1)) return;

      try {
        const idx =
          t.isNumericLiteral(a0) ? a0.value : parseInt(a0.value, 16); // 支持 0x??
        const key = a1.value;
        const lit = decodeOne(idx, key);
        if (typeof lit === 'string') {
          p.replaceWith(t.stringLiteral(lit));
        }
      } catch {
        // 解不开就跳过
      }
    },
  });
}

export async function jsjiamiV7Rc4(code, ctx = {}) {
  // 仅在包含 jsjiami v7 标记时尝试
  if (!/jsjiami\.com\.v7/.test(code)) return code;

  const pieces = collectPieces(code);
  if (!pieces.ok) {
    ctx.notes?.push?.('jsjiami_v7_rc4: Essential pieces missing');
    return code;
  }

  // 在沙箱里初始化表与解码器
  try {
    inSandboxEval(buildBootstrap(pieces));
  } catch (e) {
    ctx.notes?.push?.(`jsjiami_v7_rc4: bootstrap failed: ${e.message}`);
    return code;
  }

  const DEC = globalThis.__DEC__;
  if (typeof DEC !== 'function') {
    ctx.notes?.push?.('jsjiami_v7_rc4: decoder not available');
    return code;
  }

  const ast = parse(code);
  const decodeOne = (idx, key) => DEC(idx, key);

  // 替换所有 _0x1e61(...) 及其别名调用
  replaceDecoderCalls(ast, decodeOne);

  // 可选：安全清理（不强删，避免破坏）
  traverse.default(ast, {
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && t.isIdentifier(p.node.init, { name: '_0x1e61' })) {
        try { p.remove(); } catch {}
      }
    },
  });

  const out = print(ast);
  ctx.notes?.push?.('jsjiami_v7_rc4: replaced decoder calls via sandbox');
  return out;
}

export default jsjiamiV7Rc4;