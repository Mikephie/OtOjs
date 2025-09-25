// src/plugin/extra-codecs/jsjiami_v7_rc4.js
// 识别并静态替换 jsjiami v7 常见的字符串表 + RC4 解码调用（例如 _0x1715() + _0x1e61(idx, key)）
// 返回替换后的代码（替换次数 > 0 时会在 notes 里加入提示），解析或沙箱失败则原样返回代码。

import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import vm from "vm";

export default function jsjiamiV7Rc4Plugin(code, { notes } = {}) {
  if (typeof code !== "string") return code;

  // 解析 AST，若解析失败则直接返回原文
  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: "unambiguous",
      plugins: [
        "jsx",
        "classProperties",
        "optionalChaining",
        "nullishCoalescingOperator",
        "dynamicImport",
      ],
      errorRecovery: true,
    });
  } catch (e) {
    return code;
  }

  // 1) 尝试通过 AST 找可能的数组函数名（返回字符串表的函数）和解码器名（调用字符串表函数的解码器）
  const candidateArrayFns = new Set();
  const candidateDecoderFns = new Set();

  // helper：判断节点是否“返回数组或立即执行的 concat 链”
  function looksLikeArrayFactory(fnPath) {
    let found = false;
    fnPath.traverse({
      ReturnStatement(rp) {
        const arg = rp.node.argument;
        if (!arg) return;
        if (t.isArrayExpression(arg)) found = true;
        if (t.isCallExpression(arg) && (t.isFunctionExpression(arg.callee) || t.isArrowFunctionExpression(arg.callee))) found = true;
      },
    });
    return found;
  }

  traverse(ast, {
    FunctionDeclaration(path) {
      if (looksLikeArrayFactory(path)) {
        if (path.node.id && path.node.id.name) candidateArrayFns.add(path.node.id.name);
      }
    },
    VariableDeclarator(path) {
      const id = path.node.id;
      const init = path.node.init;
      if (t.isIdentifier(id) && (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init))) {
        if (looksLikeArrayFactory(path.get("init"))) candidateArrayFns.add(id.name);
      }
    },
    // 解码器往往是引用上面数组函数的函数（FunctionExpression / FunctionDeclaration / VariableDeclarator）
    FunctionExpression(path) {
      path.traverse({
        Identifier(idp) {
          if (candidateArrayFns.has(idp.node.name)) {
            // 上层如果被赋值给变量名，则猜测该变量是解码器
            const parent = path.parentPath.node;
            if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
              candidateDecoderFns.add(parent.id.name);
            }
            if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
              candidateDecoderFns.add(parent.left.name);
            }
          }
        },
      });
    },
    FunctionDeclaration(path) {
      path.traverse({
        Identifier(idp) {
          if (candidateArrayFns.has(idp.node.name) && path.node.id && path.node.id.name) {
            candidateDecoderFns.add(path.node.id.name);
          }
        },
      });
    },
  });

  // 如果没有通过 AST 找到 candidateArrayFns，可尝试通过简单特征猜测常见名字
  if (candidateArrayFns.size === 0) {
    ["_0x1715", "_0x1714", "_0xabc"].forEach(n => candidateArrayFns.add(n));
  }
  if (candidateDecoderFns.size === 0) {
    ["_0x1e61", "_0x1e6a", "_0xabcde"].forEach(n => candidateDecoderFns.add(n));
  }

  // 2) 在安全沙箱中执行原代码，尝试获取数组与解码器函数
  const sandbox = Object.create(null);
  // 允许少数安全 globals（避免部分脚本在访问时直接报错）
  sandbox.console = { log: () => {}, error: () => {}, warn: () => {} };
  // createContext 使用 null-proto context
  const context = vm.createContext(sandbox);

  try {
    // 执行整个源码到沙箱（timeout 限制），有风险样本可能包含大量代码，timeout 为 200ms（可调）
    vm.runInContext(code, context, { timeout: 200, displayErrors: false });
  } catch (e) {
    // 如果跑不起来也不要失败，直接继续：我们仍可以尝试基于已存在的全局标识读取
  }

  // 尝试把候选 array function 执行并拿到数组值
  let arrayValue = null;
  let arrayFuncName = null;

  for (const name of candidateArrayFns) {
    try {
      const fn = context[name];
      if (typeof fn === "function") {
        const val = fn();
        if (Array.isArray(val) && val.length > 0) {
          arrayValue = val;
          arrayFuncName = name;
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!arrayValue) {
    // 还可以尝试读取直接声明的数组变量（例如 var _0xarr = [...];）
    for (const key of Object.keys(context)) {
      try {
        if (Array.isArray(context[key]) && context[key].length > 0) {
          arrayValue = context[key];
          arrayFuncName = key;
          break;
        }
      } catch {}
    }
  }

  if (!arrayValue) {
    // 未找到字符串表，直接返回原文
    return code;
  }

  // 3) 找解码器：在沙箱里查找能访问到 arrayFuncName 的函数并能返回字符串
  let decoderName = null;
  let decoderFunc = null;

  // 优先使用候选Decoder中存在于沙箱的函数
  for (const d of candidateDecoderFns) {
    try {
      if (typeof context[d] === "function") {
        // 简单调用尝试（安全保护）
        decoderName = d;
        decoderFunc = context[d];
        break;
      }
    } catch {}
  }

  if (!decoderFunc) {
    // 扫描沙箱中所有可调用的函数，找到体内引用 arrayFuncName 的那个（保守判断）
    for (const key of Object.keys(context)) {
      try {
        const maybeFn = context[key];
        if (typeof maybeFn === "function") {
          const src = maybeFn.toString();
          if (src.includes(arrayFuncName) || src.includes("_0x")) {
            decoderName = key;
            decoderFunc = maybeFn;
            break;
          }
        }
      } catch {}
    }
  }

  if (!decoderFunc) {
    // 没有解码器，返回原文
    return code;
  }

  // 4) 遍历 AST，将能解析的 decoder(...) 调用替换成字面字符串
  let replaced = 0;
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee)) return;
      if (callee.name !== decoderName) return;

      // 支持形如: _0x1e61(0x1a,'key'), _0x1e61("0x1a",'key'), _0x1e61(26,'k'), _0x1e61(idx)
      const args = path.node.arguments;
      if (!args || args.length === 0) return;

      // 尝试把参数转换为 JS 值（保守）
      const evalArgNode = (n) => {
        if (t.isNumericLiteral(n)) return n.value;
        if (t.isStringLiteral(n)) {
          const v = n.value;
          // 如果是十六进制字符串 "0x1a"，转成数字
          if (/^0x[0-9a-f]+$/i.test(v)) return parseInt(v, 16);
          return v;
        }
        if (t.isUnaryExpression(n) && n.operator === "-" && t.isNumericLiteral(n.argument)) {
          return -n.argument.value;
        }
        // 不支持复杂表达式（放弃替换）
        return Symbol("unknown");
      };

      const argv = args.map(evalArgNode);
      if (argv.includes(Symbol("unknown"))) return;

      // 在沙箱里尝试执行 decoderFunc
      try {
        // 调用 decoder 在沙箱上下文中：注意部分解码器可能依赖到全局状态（已在 context）
        const result = decoderFunc.apply(context, argv);
        if (typeof result === "string" && result.length > 0) {
          path.replaceWith(t.stringLiteral(result));
          replaced++;
        }
      } catch {
        // 忽略单点失败
      }
    },
  });

  if (replaced > 0) {
    const out = (generate.default || generate)(ast, { jsescOption: { minimal: true } }).code;
    notes?.push?.(`jsjiami_v7_rc4: replaced ${replaced} calls via sandbox`);
    return out;
  }

  // 若未替换，直接返回原文（无破坏性）
  return code;
}