// src/plugin/extra-codecs/second-pass.js
// 用法：node src/plugin/extra-codecs/second-pass.js <in> <out>

import fs from 'fs';
import vm from 'node:vm';
import * as parser from '@babel/parser';
import generate from '@babel/generator';
import * as t from '@babel/types';
import traverseModule from '@babel/traverse';

// 兼容 ESM/CJS 的导出差异
const traverse = traverseModule.default || traverseModule;

// ------------------ 工具 ------------------
const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s, 'utf8');

function parse(code) {
  return parser.parse(code, {
    sourceType: 'script', // 混淆脚本多为非模块
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    plugins: [
      'jsx', 'optionalChaining', 'classProperties',
      'classPrivateProperties', 'classPrivateMethods',
      'numericSeparator', 'logicalAssignment',
      'topLevelAwait', 'bigInt', 'objectRestSpread'
    ],
  });
}

function isLikelyDecoder(fnPath) {
  // 在函数体内找关键特征
  let hasChar = false, hasFromChar = false, hasMod100 = false, hasDecode = false, hasB64 = false;

  fnPath.traverse({
    MemberExpression(p) {
      const prop = p.node.property;
      if (t.isIdentifier(prop, { name: 'charCodeAt' })) hasChar = true;
      if (t.isIdentifier(prop, { name: 'fromCharCode' })) hasFromChar = true;
    },
    BinaryExpression(p) {
      if (p.node.operator === '%' &&
          ((t.isNumericLiteral(p.node.left, { value: 0x100 }) || t.isNumericLiteral(p.node.right, { value: 0x100 })))) {
        hasMod100 = true;
      }
    },
    Identifier(p) {
      if (p.node.name === 'decodeURIComponent' || p.node.name === 'unescape') hasDecode = true;
    },
    StringLiteral(p) {
      // Base64 字母表
      if (/^[A-Za-z0-9+/=]{20,}$/.test(p.node.value)) hasB64 = true;
    }
  });

  // RC4/JSJIAMI 常见组合：charCodeAt + fromCharCode + %0x100 + decodeURIComponent 或 B64
  const score = (hasChar ? 1 : 0) + (hasFromChar ? 1 : 0) + (hasMod100 ? 1 : 0) + (hasDecode ? 1 : 0) + (hasB64 ? 1 : 0);
  return score >= 3;
}

function isLikelyStringTable(fnPathOrNode) {
  // 识别返回大数组/长字符串拼接的 IIFE 或函数
  let foundArray = false;
  let huge = false;

  const node = fnPathOrNode.node || fnPathOrNode;
  if (t.isFunction(node)) {
    let returns = 0;
    traverse(node.body, {
      noScope: true,
      ReturnStatement(p) {
        returns++;
        const arg = p.node.argument;
        if (t.isArrayExpression(arg) && arg.elements.length >= 10) {
          foundArray = true;
          if (arg.elements.length >= 50) huge = true;
        }
        if (t.isCallExpression(arg) && t.isMemberExpression(arg.callee) &&
            t.isIdentifier(arg.callee.property, { name: 'concat' })) {
          foundArray = true; huge = true;
        }
      }
    });
    return foundArray || huge || returns >= 2; // 多 return + concat 也很可疑
  }
  return false;
}

function collectFunctionSources(ast) {
  // 收集所有函数源码，按名字索引；也收集匿名函数（用位置信息命名）
  const pool = new Map();

  traverse(ast, {
    FunctionDeclaration(p) {
      const id = p.node.id && p.node.id.name;
      if (id) pool.set(id, generate.default ? generate.default(p.node).code : generate(p.node).code);
    },
    VariableDeclarator(p) {
      if (!t.isIdentifier(p.node.id)) return;
      const name = p.node.id.name;
      if (t.isFunctionExpression(p.node.init) || t.isArrowFunctionExpression(p.node.init)) {
        pool.set(name, generate.default ? generate.default(p.node.init).code : generate(p.node.init).code);
      }
    }
  });

  return pool;
}

function buildSandbox(functionSources) {
  // 只注入收集到的函数定义与最小安全环境
  const pieces = [];

  // atob polyfill（部分解码器用）
  pieces.push(`
    var atob = (function(){ 
      const b64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      return function(input) {
        input = String(input).replace(/=+$/, '');
        if (input.length % 4 === 1) throw new Error('atob bad input');
        let str = '', bc = 0, bs, buffer, idx = 0;
        for (; (buffer = input.charAt(idx++)); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
          bc++ % 4) ? str += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
          buffer = b64.indexOf(buffer);
        }
        return str;
      };
    })();
  `);

  // 最小全局
  pieces.push(`
    var window = {};
    var self = {};
    var global = {};
    var document = {};
    var console = { log: function(){}, warn: function(){}, error: function(){} };
    var $request = {};
    var $response = {};
  `);

  for (const code of functionSources.values()) {
    pieces.push(`;(${code});`); // 以表达式方式注入，避免声明提升冲突
  }

  const script = pieces.join('\n');
  const context = vm.createContext(Object.create(null)); // 干净上下文
  new vm.Script(script, { timeout: 100 }).runInContext(context, { timeout: 100 });
  return context;
}

function tryEvalInSandbox(context, source) {
  try {
    // 严格模式下求值
    const script = new vm.Script(`(function(){ "use strict"; return (${source}); })()`, { timeout: 100 });
    return script.runInContext(context, { timeout: 100 });
  } catch {
    return undefined;
  }
}

function secondPass(code, { notes = [] } = {}) {
  const ast = parse(code);

  // 1) 找出所有函数路径
  const fnPaths = [];
  traverse(ast, {
    FunctionDeclaration(p) { fnPaths.push(p); },
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && (t.isFunctionExpression(p.node.init) || t.isArrowFunctionExpression(p.node.init))) {
        // 取到函数表达式路径
        const fnPath = p.get('init');
        fnPaths.push(fnPath);
      }
    }
  });

  // 2) 识别候选：解码器 & 字符串表
  const decoderNames = new Set();
  const tableNames = new Set();

  for (const p of fnPaths) {
    const name = p.parentPath && t.isVariableDeclarator(p.parentPath.node) && t.isIdentifier(p.parentPath.node.id)
      ? p.parentPath.node.id.name
      : (t.isFunctionDeclaration(p.node) && p.node.id ? p.node.id.name : null);

    if (!name) continue;

    if (isLikelyDecoder(p)) decoderNames.add(name);
    if (isLikelyStringTable(p)) tableNames.add(name);
  }

  if (decoderNames.size === 0 && tableNames.size === 0) {
    console.log('[second-pass] 没发现解码器候选，跳过');
    return code;
  }

  // 3) 提取候选函数源码，建立沙箱
  const pool = collectFunctionSources(ast);
  const needed = new Map();
  for (const n of decoderNames) if (pool.has(n)) needed.set(n, pool.get(n));
  for (const n of tableNames) if (pool.has(n)) needed.set(n, pool.get(n));

  const sandbox = buildSandbox(needed);
  const before = code;
  let changed = 0;

  // 4) 替换调用点：decoderName(常量…) / decoderName(tableName()[…], …)
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!t.isIdentifier(callee)) return;
      const name = callee.name;
      if (!decoderNames.has(name) && !tableNames.has(name)) return;

      // 构造要执行的源码片段（只用字面量/可序列化表达式）
      // 直接取生成的代码：callee(args…)
      const src = (generate.default ? generate.default(path.node).code : generate(path.node).code);

      // 执行
      const val = tryEvalInSandbox(sandbox, src);
      if (typeof val === 'string') {
        path.replaceWith(t.stringLiteral(val));
        changed++;
        return;
      }
      // 如果是 number / boolean 也替换（少见但做一下）
      if (typeof val === 'number') { path.replaceWith(t.numericLiteral(val)); changed++; return; }
      if (typeof val === 'boolean') { path.replaceWith(val ? t.booleanLiteral(true) : t.booleanLiteral(false)); changed++; return; }
    }
  });

  if (changed > 0) {
    notes.push(`second-pass: inlined ${changed} call(s)`);
  } else {
    console.log('[second-pass] 未发现可静态求值的调用点（可能参数不是常量，或候选在更深的闭包里）');
  }

  const out = (generate.default ? generate.default(ast, { compact: false }).code : generate(ast, { compact: false }).code);
  return out;
}

// ------------------ CLI ------------------
const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('Usage: node src/plugin/extra-codecs/second-pass.js <in> <out>');
  process.exit(2);
}

console.log('===== SECOND PASS START =====');
const input = read(inFile);
let output = input;

// 尝试 2-3 轮直到稳定（有些调用替换后才能解锁下一批）
for (let i = 1; i <= 3; i++) {
  const notes = [];
  const next = secondPass(output, { notes });
  if (next === output) {
    if (i > 1) console.log(`[second-pass] converge at pass ${i - 1}`);
    break;
  }
  output = next;
  console.log(`[second-pass] pass ${i} changed. ${notes.join(' | ')}`);
}

write(outFile, output);
console.log('===== SECOND PASS END =====');
