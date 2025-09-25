// plugins/extra-codecs/jsjiami_v7_rc4.js
const { parse, print, traverse, t, evalInSandbox } = require('./common');

/**
 * 识别特征：
 *  1) 存在函数 _0x1715() 返回一个数组（字符串表）
 *  2) 存在函数 _0x1e61(index, key)；函数体内包含 base64 字符串字符集：
 *     "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/="
 *  3) 调用点形如 _0x1e61(0xeb,'r@dH') 或 其封装函数 _0xc3dd0a(…)
 */
function detectJsjiamiV7(ast) {
  let hasTable = false, hasDecoder = false;

  traverse(ast, {
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

function extractDecoderBundle(ast, code) {
  // 把字符串表 + 解码器 函数字面量拼起来，在沙箱里评估
  let tableSrc = '', decoderSrc = '';
  traverse(ast, {
    FunctionDeclaration(p) {
      const name = p.node.id?.name;
      if (name === '_0x1715') tableSrc = print(p.node);
      if (name === '_0x1e61') decoderSrc = print(p.node);
    }
  });

  if (!tableSrc || !decoderSrc) {
    throw new Error('Essential code missing: string table or decoder not found');
  }

  const bootstrap = `
    ${tableSrc}
    ${decoderSrc}
    // 暴露到全局以便调用
    globalThis.__TABLE__ = _0x1715();
    globalThis.__DEC__   = _0x1e61;
  `;

  evalInSandbox(bootstrap, {});
  return {
    decode: (idx, key) => globalThis.__DEC__(idx, key),
    table: globalThis.__TABLE__
  };
}

function replaceCalls(ast, decodeFn) {
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      // 1) 直接调用 _0x1e61(...)
      const isDirect =
        t.isIdentifier(callee, { name: '_0x1e61' });

      // 2) 间接封装器，如 const _0xc3dd0a = _0x1e61;  → 识别 Identifier 引用
      const isAlias = t.isIdentifier(callee) && callee.name !== '_0x1e61' && p.scope.getBinding(callee.name)?.path?.isVariableDeclarator() && (() => {
        try {
          const init = p.scope.getBinding(callee.name).path.node.init;
          return t.isIdentifier(init, { name: '_0x1e61' });
        } catch { return false; }
      })();

      if (!(isDirect || isAlias)) return;

      const args = p.node.arguments;
      if (args.length < 2) return;
      if (!t.isNumericLiteral(args[0]) && !t.isStringLiteral(args[0])) return;
      if (!t.isStringLiteral(args[1])) return;

      try {
        const idx = t.isNumericLiteral(args[0]) ? args[0].value : parseInt(args[0].value, 16);
        const key = args[1].value;
        const literal = decodeFn(idx, key);
        if (typeof literal === 'string') {
          p.replaceWith(t.stringLiteral(literal));
        }
      } catch { /* 解不开就跳过 */ }
    }
  });
}

async function jsjiamiV7Rc4(code, ctx = {}) {
  const ast = parse(code);
  if (!detectJsjiamiV7(ast)) return code; // 非目标，原样返回

  let bundle;
  try {
    bundle = extractDecoderBundle(ast, code);
  } catch (e) {
    ctx.notes?.push?.(`jsjiami_v7_rc4: ${e.message}`);
    return code;
  }

  replaceCalls(ast, bundle.decode);

  // 可选：把 _0x1715 / _0x1e61 等死代码移除（只做安全清理）
  traverse(ast, {
    FunctionDeclaration(p) {
      const name = p.node.id?.name;
      if (name === '_0x1715' || name === '_0x1e61') {
        try { p.remove(); } catch {}
      }
    },
    VariableDeclarator(p) {
      // 形如 const _0xc3dd0a = _0x1e61;
      if (t.isIdentifier(p.node.id) && t.isIdentifier(p.node.init, { name: '_0x1e61' })) {
        try { p.remove(); } catch {}
      }
    }
  });

  const out = print(ast);
  ctx.notes?.push?.('jsjiami_v7_rc4: replaced string-decoder calls');
  return out;
}

module.exports = { jsjiamiV7Rc4 };