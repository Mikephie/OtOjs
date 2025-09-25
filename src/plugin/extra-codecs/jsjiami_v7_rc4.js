// src/plugin/extra-codecs/jsjiami_v7_rc4.js
// 目的：针对常见 jsjiami v7（RC4 变体）样本，尽量不解析大 AST，先用沙箱执行还原常见 _0x.. 字符串表调用。
// 失败则不破坏原文，仅记录 notes。

import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import vm from 'vm';

const traverse = _traverse?.default || _traverse;
const generate = _generate?.default || _generate;

/**
 * 轻量还原 jsjiami v7 rc4 的若干 _0x?? 调用
 * @param {string} code
 * @param {{notes?: string[]}} ctx
 * @returns {Promise<string>}
 */
export default async function jsjiamiV7Rc4Plugin(code, ctx = {}) {
  const notes = ctx.notes || [];
  const src = String(code);

  try {
    // --- 快速定位：解密函数与表函数（例如 function _0x1e61(...)、function _0x1715() {...}） ---
    // 解析成 AST，只用来找函数名，避免做大规模改写
    const ast = parse(src, {
      sourceType: 'script',
      plugins: [], // 保守：样本多为普通脚本
    });

    let decryptor = null;   // 比如 _0x1e61
    let tableFunc = null;   // 比如 _0x1715

    traverse(ast, {
      FunctionDeclaration(path) {
        const id = path.node.id;
        if (!id || !/^_0x[a-f0-9]{3,}$/i.test(id.name)) return;
        // 经验：字符串表函数常返回数组；解密函数常带两个参数或内部引用 base64/rc4 等
        const srcSnippet = generate(path.node).code;
        if (!decryptor && /\bfromCharCode\b/.test(srcSnippet)) {
          decryptor = id.name;
        }
        if (!tableFunc && /\breturn\s*\[/.test(srcSnippet)) {
          tableFunc = id.name;
        }
      },
      VariableDeclarator(path) {
        // 处理 const _0xc3dd0a = _0x1e61; 这种别名
        const { id, init } = path.node;
        if (t.isIdentifier(id) && t.isIdentifier(init)) {
          if (/^_0x[a-f0-9]{3,}$/i.test(id.name) && /^_0x[a-f0-9]{3,}$/i.test(init.name)) {
            // 优先把右侧当成真实解密函数
            decryptor = init.name;
          }
        }
      },
    });

    if (!decryptor) {
      notes.push('jsjiamiV7Rc4: no decryptor found');
      return src;
    }

    // --- 构建沙箱：注入必要的片段（_0x1e61、_0x1715 等） ---
    // 粗糙方式：截取到 decryptor 定义附近的一段，同时把 table 函数一起注入。
    // 失败就直接返回原文，不抛错。
    const decIdx = src.indexOf(`function ${decryptor}`);
    if (decIdx < 0) {
      notes.push('jsjiamiV7Rc4: decryptor definition not found');
      return src;
    }

    // 把 “表函数 + 解密函数” 两段拼出引导；容错：找不到表函数就只注入解密函数
    let bootPieces = '';
    if (tableFunc) {
      const tableIdx = src.indexOf(`function ${tableFunc}`);
      if (tableIdx >= 0) {
        // 截一段够用的上下文
        bootPieces += src.slice(tableIdx, tableIdx + 4000);
      }
    }
    bootPieces += src.slice(decIdx, decIdx + 8000);

    const context = vm.createContext({});
    try {
      vm.runInContext(`${bootPieces}; this.__DEC__ = ${decryptor};`, context, { timeout: 80 });
    } catch (e) {
      notes.push(`jsjiamiV7Rc4: bootstrap failed: ${e.message || e}`);
      return src;
    }
    const decFn = context.__DEC__;
    if (typeof decFn !== 'function') {
      notes.push('jsjiamiV7Rc4: decryptor not executable');
      return src;
    }

    // --- 轻量替换：_0x1e61(0x123) / _0x1e61(291) / _0x1e61(291,"salt") ---
    let replaced = 0;
    const callRe = new RegExp(
      `${decryptor}\\s*\\(\\s*(0x[0-9a-fA-F]+|\\d+)\\s*(?:,\\s*(['"\`]).*?\\2\\s*)?\\)`,
      'g'
    );

    const out = src.replace(callRe, (m, hexOrDec) => {
      try {
        const idx = Number(hexOrDec);
        const val = decFn(idx);
        if (typeof val === 'string') {
          replaced++;
          return JSON.stringify(val);
        }
        return m;
      } catch {
        return m;
      }
    });

    notes.push(`jsjiamiV7Rc4: replaced ${replaced} calls via sandbox`);
    return out;
  } catch (e) {
    notes.push(`jsjiamiV7Rc4Plugin failed: ${e.message}`);
    return src;
  }
}