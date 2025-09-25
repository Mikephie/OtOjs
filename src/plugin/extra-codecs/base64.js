// plugin/extra-codecs/base64.js
// 自动解码源码里的 Base64 字符串常量（ESM + Babel 兼容）

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";
import * as t from "@babel/types";

function looksLikeBase64(str) {
  // 至少 8 位、仅 Base64 字符、长度为 4 的倍数
  return /^[A-Za-z0-9+/=]{8,}$/.test(str) && str.length % 4 === 0;
}

function safeDecode(str) {
  try {
    const buf = Buffer.from(str, "base64");
    const txt = buf.toString("utf-8");
    // 仅在解码后包含可打印字符/中日韩统一表意文字时替换
    if (/^[\x09\x0A\x0D\x20-\x7E\u4E00-\u9FFF]+$/.test(txt)) {
      return txt;
    }
  } catch {}
  return null;
}

export default async function base64Plugin(source, ctx = {}) {
  const ast = parser.parse(source, { sourceType: "unambiguous" });
  let replaced = 0;

  // 注意：某些打包环境下 @babel/traverse 需要 .default
  (traverse.default || traverse)(ast, {
    StringLiteral(path) {
      const raw = path.node.value;
      if (!raw || raw.length < 8) return;
      if (!looksLikeBase64(raw)) return;

      const decoded = safeDecode(raw);
      if (decoded && decoded.length >= 3) {
        path.replaceWith(t.stringLiteral(decoded));
        replaced++;
      }
    },
  });

  if (replaced > 0) {
    ctx.notes?.push?.(`base64: 解码了 ${replaced} 个字符串常量`);
    return (generate.default || generate)(ast, { compact: false }).code;
  }
  return source;
}