// plugin/format.js — 稳定版（类型防护 + Prettier 可选 + Babel 回退）

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import generate from "@babel/generator";

// 若输入不是字符串，则直接原样返回，避免 babel 报 this.input.charCodeAt is not a function
export default async function formatPlugin(source, ctx = {}) {
  if (typeof source !== "string") return source;

  // 先尝试 Prettier（可选）
  try {
    const prettier = await import("prettier");
    try {
      const pretty = await prettier.format(source, {
        parser: "babel",
        singleQuote: false,
        semi: true,
        printWidth: 100,
        tabWidth: 2,
      });
      if (typeof pretty === "string" && pretty.trim()) {
        ctx.notes?.push?.("format: prettier");
        return pretty;
      }
    } catch (e) {
      // prettier 解析失败则回退
    }
  } catch {
    // 未安装 prettier，直接回退 babel
  }

  // Babel 回退（轻解析 → 原样生成）
  try {
    const ast = parser.parse(source, {
      sourceType: "unambiguous",
      plugins: ["jsx", "classProperties", "optionalChaining"],
    });
    // 这里不做 transform，只做一次生成，等价“规范化缩进/换行”
    const out = (generate.default || generate)(ast, {
      retainLines: false,
      compact: false,
      comments: true,
      jsescOption: { minimal: true },
    }).code;
    ctx.notes?.push?.("format: babel-generator");
    return out || source;
  } catch (e) {
    // 连 babel 都失败，保底返回原文，防止崩
    ctx.notes?.push?.(`format: skip (${e.message})`);
    return source;
  }
}