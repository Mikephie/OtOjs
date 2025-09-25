// 二次解密（宽松模式）：在沙箱里执行解码器调用并回填字面量
// 用法：node src/plugin/extra-codecs/second-pass.js <input.js> <output.deob2.js>

import fs from 'fs';
import vm from 'vm';
import { parse } from '@babel/parser';
import traverseOrig from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

const traverse = (traverseOrig && traverseOrig.default) || traverseOrig;

// ------------- 工具 -------------
const readFile = (p) => fs.readFileSync(p, 'utf-8');
const writeFile = (p, s) => fs.writeFileSync(p, s, 'utf-8');

const parseAst = (code) =>
  parse(code, {
    sourceType: 'unambiguous',
    plugins: [
      'jsx',
      'optionalChaining',
      'nullishCoalescingOperator',
      'classProperties',
      'topLevelAwait',
      'dynamicImport',
      'numericSeparator',
      'logicalAssignment',
    ],
  });

const isLiteral = (n) =>
  t.isStringLiteral(n) || t.isNumericLiteral(n) || t.isBooleanLiteral(n) || t.isNullLiteral(n);

// ------------- 识别候选调用 -------------
function collectDecoderCalls(ast) {
  const calls = [];
  traverse(ast, {
    CallExpression(path) {
      const { node } = path;
      // 仅处理 Identifier 调用（_0x****(...)）
      if (!t.isIdentifier(node.callee)) return;
      const name = node.callee.name;
      if (!/^_0x[a-fA-F0-9]+$/.test(name)) return;

      // 参数多数是字面量（允许 1~3 个，极简规则）
      const args = node.arguments || [];
      if (args.length === 0 || args.length > 3) return;

      // 允许“宽松模式”：只要参数**都是**字面量即可；（如需更激进可放宽）
      const allLit = args.every((a) => isLiteral(a));
      if (!allLit) return;

      calls.push({ name, path, args });
    },
  });
  return calls;
}

// ------------- 抽取解码器相关定义 -------------
function extractPrelude(code, wantNames) {
  // 为了稳健：用 AST 找出目标函数/变量的顶层定义
  const ast = parseAst(code);
  const top = ast.program.body;

  const picked = new Set();
  const chunks = [];

  const want = new Set(wantNames);
  // 一些常见依赖（可选）
  if (want.has('_0x1e61')) {
    want.add('_0x1715');
    want.add('_0xodH');
  }

  // 扫描顶层，把匹配的 FunctionDeclaration / VariableDeclaration 抽出来
  for (const node of top) {
    if (t.isFunctionDeclaration(node) && t.isIdentifier(node.id) && want.has(node.id.name)) {
      chunks.push(code.slice(node.start, node.end));
      picked.add(node.id.name);
    } else if (t.isVariableDeclaration(node)) {
      for (const d of node.declarations) {
        if (t.isIdentifier(d.id) && want.has(d.id.name)) {
          chunks.push(code.slice(node.start, node.end));
          picked.add(d.id.name);
          break;
        }
      }
    }
  }

  // 兜底：若没抽到任何东西，尝试使用正则粗提（匹配 function _0x****(）
  if (chunks.length === 0) {
    for (const n of want) {
      const re = new RegExp(`function\\s+${n}\\s*\\((.|\\n)*?\\{`, 'm');
      const m = re.exec(code);
      if (m) {
        // 简单向后括号匹配（稳健起见这块尽量避免）
        // 这里给一个保守的备份：直接剪到下一个 "function _0x" 或文件结尾
        const idx = m.index;
        const tail = code.slice(idx);
        const m2 = /function\s+_0x[a-fA-F0-9]+\s*\(/m.exec(tail.slice(1));
        const end = m2 ? idx + 1 + m2.index : code.length;
        chunks.push(code.slice(idx, end));
      }
    }
  }

  return chunks.join('\n\n');
}

// ------------- 构建沙箱环境 -------------
function buildSandbox(withGlobals = {}) {
  const sandbox = {
    // 常用内建
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {},
    },
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    // atob/btoa in Node
    atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
    btoa: (bin) => Buffer.from(bin, 'binary').toString('base64'),
    Buffer,
    // URL decode/encode
    decodeURIComponent,
    encodeURIComponent,

    // 宽松模式关键：mock 运行时对象，避免 ReferenceError
    $request: {},
    $response: { body: '{}' },
    $done: () => {},

    // ECMAScript 全局
    globalThis: undefined,
  };

  sandbox.globalThis = sandbox;

  // 允许外部注入（如预设某些常量）
  Object.assign(sandbox, withGlobals);

  return sandbox;
}

function tryEvalInSandbox(prelude, expr, seeded = {}) {
  const sandbox = buildSandbox(seeded);
  try {
    vm.createContext(sandbox, { codeGeneration: { strings: true, wasm: false } });

    const script = new vm.Script(`${prelude}\n;__DEOBF_RESULT__ = (${expr});`, {
      timeout: 2000,
      displayErrors: false,
    });

    script.runInContext(sandbox, { timeout: 2000 });
    return sandbox.__DEOBF_RESULT__;
  } catch (e) {
    return { __error: e && (e.message || String(e)) };
  }
}

// ------------- 主流程 -------------
function runSecondPass(inPath, outPath) {
  const raw = readFile(inPath);
  console.log('===== SECOND PASS START =====');

  let ast;
  try {
    ast = parseAst(raw);
  } catch (e) {
    console.error('[second-pass] 解析失败:', e.message);
    process.exit(1);
  }

  // 收集解码调用
  const calls = collectDecoderCalls(ast);
  if (!calls.length) {
    console.log('[second-pass] 没发现解码器候选，跳过');
    console.log('===== SECOND PASS END =====');
    writeFile(outPath, raw);
    return;
  }

  // 需要的解码器函数名
  const names = Array.from(new Set(calls.map((c) => c.name)));
  const prelude = extractPrelude(raw, names);

  if (!prelude || !prelude.trim()) {
    console.log('[second-pass] 未能抽取到任何解码器定义，跳过');
    console.log('===== SECOND PASS END =====');
    writeFile(outPath, raw);
    return;
  }

  let replaced = 0;

  for (const { name, path, args } of calls) {
    // 生成表达式源码： name(arg1, arg2, ...)
    const argCode = args
      .map((a) => {
        if (t.isStringLiteral(a)) return JSON.stringify(a.value);
        if (t.isNumericLiteral(a)) return String(a.value);
        if (t.isBooleanLiteral(a)) return String(a.value);
        if (t.isNullLiteral(a)) return 'null';
        // 不应出现，这里兜底
        return 'undefined';
      })
      .join(',');

    const expr = `${name}(${argCode})`;
    const r = tryEvalInSandbox(prelude, expr);

    if (r && r.__error) {
      // 失败，跳过不替换
      continue;
    }

    // 安全替换：字符串-> StringLiteral；数字-> NumericLiteral；布尔/空值照样
    if (typeof r === 'string') {
      path.replaceWith(t.stringLiteral(r));
      replaced++;
    } else if (typeof r === 'number' && Number.isFinite(r)) {
      path.replaceWith(t.numericLiteral(r));
      replaced++;
    } else if (typeof r === 'boolean') {
      path.replaceWith(t.booleanLiteral(r));
      replaced++;
    } else if (r === null) {
      path.replaceWith(t.nullLiteral());
      replaced++;
    } else {
      // 其他复杂类型不替换
    }
  }

  if (!replaced) {
    console.log('[second-pass] 未发现可静态求值的调用点（可能参数不是常量，或候选在更深的闭包里）');
    console.log('===== SECOND PASS END =====');
    writeFile(outPath, raw);
    return;
  }

  const { code } = generate(ast, { jsescOption: { minimal: true } }, raw);
  writeFile(outPath, code);

  console.log(`[second-pass] 替换成功：${replaced} 处`);
  console.log('===== SECOND PASS END =====');
}

// ------------- CLI -------------
const [,, inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('用法: node src/plugin/extra-codecs/second-pass.js <input.js> <output.js>');
  process.exit(2);
}

runSecondPass(inPath, outPath);