// plugins/jsjiami_v7.js
// 作用：针对 jsjiami v7 样本（带 _0x1715 字符串表 + _0x1e61 解密函数）
// 做“运行期解表 + AST 文字化替换”，产出接近明文的代码。
// 失败则返回 null，让上游继续走兜底格式化。
import ivm from "isolated-vm";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";

const MAX_SRC_LEN = 2_000_000; // 防止过大脚本拖慢 CI

export default async function jsjiamiV7(input) {
  if (
    !/jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(
      input
    )
  ) {
    return null;
  }

  // 只处理前 MAX_SRC_LEN，避免超大文件
  const src =
    input.length > MAX_SRC_LEN ? input.slice(0, MAX_SRC_LEN) : String(input);

  // 先粗检关键函数是否存在
  if (!/function\s+_0x1715\s*\(\)/.test(src) || !/function\s+_0x1e61\s*\(/.test(src)) {
    // 如果命名被变种改了，就保守清壳（沿用你旧逻辑）
    return stripShellKeepMarker(input);
  }

  try {
    // 1) 提取 _0x1715 与 _0x1e61 的源码（简单正则块提取，足够应对该类样本）
    const f1715 = extractFunc(src, "_0x1715");
    const f1e61 = extractFunc(src, "_0x1e61");
    if (!f1715 || !f1e61) {
      return stripShellKeepMarker(input);
    }

    // 2) 在 isolated-vm 沙箱内只加载这两段函数与必要变量，构造一个安全的解密方法
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());

    const bootstrap =
      [
        // 需要的前置变量（样本中 _0x1715 依赖 _0xodH）
        `var _0xodH = "jsjiami.com.v7";`,
        // 字符串表函数
        f1715,
        // 解密函数
        f1e61,
        // 暴露一个安全的解密桥
        `
        global.__dec = function(a, b) {
          try { return _0x1e61(a, b); } catch (e) { return null; }
        };
        `,
      ].join("\n");

    const script = await isolate.compileScript(bootstrap, {
      filename: "jjiami-bootstrap.js",
    });
    await script.run(context, { timeout: 500 });

    // 3) 解析整份脚本，找到所有 _0x1e61(数字, "密钥") 调用并替换为字面量
    const ast = parse(input, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
    });

    const toRemove = new Set(["_0x1715", "_0x1e61"]);
    const decoder = async (idx, key) => {
      try {
        const res = await context.eval(`__dec(${idx}, ${JSON.stringify(key)})`, {
          timeout: 100,
        });
        return typeof res === "string" ? res : null;
      } catch {
        return null;
      }
    };

    // 收集需异步替换的节点（避免在 traverse 中 await）
    const jobs = [];
    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;
        if (t.isIdentifier(callee, { name: "_0x1e61" })) {
          const args = path.node.arguments;
          if (
            args.length === 2 &&
            t.isNumericLiteral(args[0]) &&
            (t.isStringLiteral(args[1]) || isStaticString(args[1]))
          ) {
            const idx = args[0].value;
            const key = evalStaticString(args[1]); // 取字面量
            jobs.push({ path, idx, key });
          }
        }
      },
    });

    // 执行解密并替换
    for (const job of jobs) {
      const val = await decoder(job.idx, job.key);
      if (typeof val === "string") {
        job.path.replaceWith(t.stringLiteral(val));
      }
    }

    // 4) 移除 _0x1715 / _0x1e61 的定义（已文字化，不再需要）
    traverse(ast, {
      FunctionDeclaration(path) {
        const name = path.node.id?.name;
        if (name && toRemove.has(name)) {
          path.remove();
        }
      },
      VariableDeclarator(path) {
        // 清理 version_ / encode_version 等无用标识变量（保守）
        const id = path.node.id;
        if (t.isIdentifier(id) && /^(version_|encode_version|_0xodH)$/.test(id.name)) {
          path.remove();
        }
      },
    });

    const out = generate(ast, { retainLines: false, compact: false }).code;
    await context.release();
    isolate.dispose();

    return out;
  } catch (e) {
    // 任何异常回落到保守清壳，确保不中断流水线
    return stripShellKeepMarker(input);
  }
}

/* ========= 工具函数 ========= */

function extractFunc(code, name) {
  // 粗略方式：从 "function name(" 开始，匹配到首个独立的右花括号闭合
  const start = code.indexOf(`function ${name}`);
  if (start < 0) return null;
  // 截取后半段并做简单括号计数
  const sub = code.slice(start);
  const openIdx = sub.indexOf("{");
  if (openIdx < 0) return null;
  let depth = 0;
  for (let i = openIdx; i < sub.length; i++) {
    const ch = sub[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return sub.slice(0, i + 1);
      }
    }
  }
  return null;
}

function isStaticString(node) {
  // 兼容模板字面量
  return (
    t.isStringLiteral(node) ||
    (t.isTemplateLiteral(node) && node.expressions.length === 0)
  );
}
function evalStaticString(node) {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
  }
  return "";
}

function stripShellKeepMarker(input) {
  // 保留 encode_version 行，去除常见自检 try-catch 与死壳（你的旧逻辑+注释）
  let code = String(input);
  code = code.replace(
    /;?\s*var\s+encode_version\s*=\s*['"]jsjiami\.com\.v7['"];?/i,
    (m) => m
  );
  code = code.replace(
    /try\s*\{[\s\S]{0,800}?\}\s*catch\s*\([^)]+\)\s*\{\s*\};?/g,
    "/* [strip:try-catch-self-check] */"
  );
  code = code.replace(
    /if\s*\(\!?\s*function\s*\([\w, ]*\)\s*\{[\s\S]{0,2000}?\}\s*\(\)\)\s*;?/g,
    "/* [strip:dead-wrapper] */"
  );
  return code;
}
