// plugins/jsjiami_v7.js
// jsjiami v7 运行期解表 + AST 文字化替换（含别名识别：const alias = _0x1e61）
import ivm from "isolated-vm";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";
import generateModule from "@babel/generator";

// 兼容 ESM/CJS 的默认导出差异
const traverse = (traverseModule.default || traverseModule);
const generate = (generateModule.default || generateModule);


const MAX_SRC_LEN = 2_000_000;

export default async function jsjiamiV7(input) {
  if (
    !/jsjiami\.com\.v7|encode_version\s*=\s*['"]jsjiami\.com\.v7['"]/i.test(
      input
    )
  ) {
    return null;
  }

  const src =
    input.length > MAX_SRC_LEN ? input.slice(0, MAX_SRC_LEN) : String(input);

  // 要求存在典型结构：_0x1715 字符串表 + _0x1e61 解码
  if (!/function\s+_0x1715\s*\(\)/.test(src) || !/function\s+_0x1e61\s*\(/.test(src)) {
    return stripShellKeepMarker(input);
  }

  try {
    const f1715 = extractFunc(src, "_0x1715");
    const f1e61 = extractFunc(src, "_0x1e61");
    if (!f1715 || !f1e61) return stripShellKeepMarker(input);

    // 只加载必要函数到沙箱
    const isolate = new ivm.Isolate({ memoryLimit: 64 });
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());

    const bootstrap =
      `
      var _0xodH = "jsjiami.com.v7";
      ` +
      f1715 +
      "\n" +
      f1e61 +
      `
      global.__dec = function(a, b) {
        try { return _0x1e61(a, b); } catch (e) { return null; }
      };
      `;
    const script = await isolate.compileScript(bootstrap, {
      filename: "jjiami-bootstrap.js",
    });
    await script.run(context, { timeout: 500 });

    // 解析整份源代码
    const ast = parse(input, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["jsx", "classProperties", "optionalChaining", "dynamicImport"],
    });

    // === 新增：收集所有指向 _0x1e61 的“别名” ===
    const decoderNames = new Set(["_0x1e61"]);
    traverse(ast, {
      VariableDeclarator(path) {
        const id = path.node.id;
        const init = path.node.init;
        if (t.isIdentifier(id) && t.isIdentifier(init, { name: "_0x1e61" })) {
          decoderNames.add(id.name); // 如 const _0xc3dd0a = _0x1e61;
        }
      },
      AssignmentExpression(path) {
        const { left, right, operator } = path.node;
        if (operator === "=" && t.isIdentifier(right, { name: "_0x1e61" })) {
          if (t.isIdentifier(left)) decoderNames.add(left.name); // 如 alias = _0x1e61
        }
      },
    });

    // 工具：异步调用沙箱里的 __dec
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

    // 先收集所有待替换点（避免 traverse 里 await）
    const jobs = [];
    traverse(ast, {
      CallExpression(path) {
        const callee = path.node.callee;
        if (t.isIdentifier(callee) && decoderNames.has(callee.name)) {
          const args = path.node.arguments;
          if (
            args.length === 2 &&
            t.isNumericLiteral(args[0]) &&
            (t.isStringLiteral(args[1]) || isStaticString(args[1]))
          ) {
            const idx = args[0].value;
            const key = evalStaticString(args[1]);
            jobs.push({ path, idx, key });
          }
        }
      },
    });

    // 执行解密并替换为字面量
    for (const job of jobs) {
      const val = await decoder(job.idx, job.key);
      if (typeof val === "string") {
        job.path.replaceWith(t.stringLiteral(val));
      }
    }

    // 移除 _0x1715 / _0x1e61 定义与标识保留变量
    const toRemove = new Set(["_0x1715", "_0x1e61"]);
    traverse(ast, {
      FunctionDeclaration(path) {
        const name = path.node.id?.name;
        if (name && toRemove.has(name)) path.remove();
      },
      VariableDeclarator(path) {
        const id = path.node.id;
        if (
          t.isIdentifier(id) &&
          /^(version_|encode_version|_0xodH)$/.test(id.name)
        ) {
          path.remove();
        }
      },
    });

    const out = generate(ast, { retainLines: false, compact: false }).code;
    await context.release();
    isolate.dispose();

    return out;
  } catch {
    return stripShellKeepMarker(input);
  }
}

/* ===== 工具函数 ===== */
function extractFunc(code, name) {
  const start = code.indexOf(`function ${name}`);
  if (start < 0) return null;
  const sub = code.slice(start);
  const openIdx = sub.indexOf("{");
  if (openIdx < 0) return null;
  let depth = 0;
  for (let i = openIdx; i < sub.length; i++) {
    const ch = sub[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return sub.slice(0, i + 1);
    }
  }
  return null;
}

function isStaticString(node) {
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
