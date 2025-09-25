// plugin/extra-codecs/base64.js
// 自动解码源码里的 Base64 字符串常量

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

/**
 * 判断一个字符串是不是 Base64
 */
function looksLikeBase64(str) {
  return /^[A-Za-z0-9+/=]{8,}$/.test(str) && str.length % 4 === 0;
}

/**
 * Base64 解码
 */
function safeDecode(str) {
  try {
    const buf = Buffer.from(str, "base64");
    const txt = buf.toString("utf-8");
    // 只接受有意义的可打印字符
    if (/^[\x09\x0A\x0D\x20-\x7E\u4e00-\u9fff]+$/.test(txt)) {
      return txt;
    }
  } catch (_) {}
  return null;
}

/**
 * 插件入口
 */
export default async function base64Plugin(source, ctx = {}) {
  const ast = parse(source, { sourceType: "unambiguous" });
  let replaced = 0;

  traverse(ast, {
    StringLiteral(path) {
      const raw = path.node.value;
      if (looksLikeBase64(raw)) {
        const decoded = safeDecode(raw);
        if (decoded && decoded.length >= 3) {
          path.replaceWith(t.stringLiteral(decoded));
          replaced++;
        }
      }
    }
  });

  if (replaced > 0) {
    ctx.notes?.push?.(`base64: 解码了 ${replaced} 个字符串常量`);
    return generate(ast, { compact: false }).code;
  }
  return source;
}