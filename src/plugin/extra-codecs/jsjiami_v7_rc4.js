// plugin/extra-codecs/jsjiami_v7_rc4.js
import { parse, print, traverse, t, evalInSandbox } from './common.js';

/**
 * 识别特征：
 *  1) 函数 _0x1715() 返回数组（字符串表）
 *  2) 函数 _0x1e61(idx, key) 体内包含 base64 字符集：“abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=”
 *  3) 代码中有 _0x1e61(0xeb,'r@dH') 或其别名调用
 */
function detectJsjiamiV7(ast) {
  let hasTable = false, hasDecoder = false;
  traverse.default(ast, {
    FunctionDeclaration(p) {
      const name = p.node.id?.name;
      if (name === '_0x1715') hasTable = true;
      if (name === '_0x1e61') {
        const src = print(p.node);
        if (src.includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=')) {
          hasDecoder = true;
        }
      }
    }
  });
  return hasTable && hasDecoder;
}

function extractBundle(ast) {
  let tableFn = '', decFn = '';
  traverse.default(ast, {
    FunctionDeclaration(p) {
      const name = p.node.id?.name;
      if (name === '_0x1715') tableFn = print(p.node);
      if (name === '_0x1e61') decFn   = print(p.node);
    }
  });
  if (!tableFn || !decFn) throw new Error('Essential code missing: string table or decoder not found');

  const bootstrap = `
    ${tableFn}
    ${decFn}
    globalThis.__TABLE__ = _0x1715();
    globalThis.__DEC__   = _0x1e61;
  `;
  evalInSandbox(bootstrap, {});
  const decode = (idx, key) => globalThis.__DEC__(idx, key);
  return { decode };
}

function isAliasOf(path, targetName) {
  const binding = path.scope.getBinding(path.node.callee?.name);
  if (!binding || !binding.path?.isVariableDeclarator()) return false;
  const init = binding.path.node.init;
  return t.isIdentifier(init, { name: targetName });
}

function replaceDecoderCalls(ast, decode) {
  traverse.default(ast, {
    CallExpression(p) {
      const callee = p.node.callee;

      const direct = t.isIdentifier(callee, { name: '_0x1e61' });
      const alias  = t.isIdentifier(callee) && callee.name !== '_0x1e61' && isAliasOf(p, '_0x1e61');
      if (!(direct || alias)) return;

      const [a0, a1] = p.node.arguments;
      if (!a0 || !a1) return;
      if (!(t.isNumericLiteral(a0) || t.isStringLiteral(a0))) return;
      if (!t.isStringLiteral(a1)) return;

      try {
        const idx = t.isNumericLiteral(a0) ? a0.value : parseInt(a0.value, 16);
        const key = a1.value;
        const literal = decode(idx, key);
        if (typeof literal === 'string') {
          p.replaceWith(t.stringLiteral(literal));
        }
      } catch { /* 解不开就跳过 */ }
    }
  });
}

export async function jsjiamiV7Rc4(code, ctx = {}) {
  const ast = parse(code);
  if (!detectJsjiamiV7(ast)) return code;

  const { decode } = extractBundle(ast);
  replaceDecoderCalls(ast, decode);

  // 可选清理：移除 _0x1715/_0x1e61 及别名（只做安全删除）
  traverse.default(ast, {
    FunctionDeclaration(p) {
      const name = p.node.id?.name;
      if (name === '_0x1715' || name === '_0x1e61') {
        try { p.remove(); } catch {}
      }
    },
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && t.isIdentifier(p.node.init, { name: '_0x1e61' })) {
        try { p.remove(); } catch {}
      }
    }
  });

  const out = print(ast);
  ctx.notes?.push?.('jsjiami_v7_rc4: replaced string-decoder calls');
  return out;
}