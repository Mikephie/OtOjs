// ESM
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

// ---------- helpers ----------
const log = (...a) => console.log('[second-pass]', ...a);
const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);

const parserOpts = {
  sourceType: 'unambiguous',
  allowReturnOutsideFunction: true,
  plugins: [
    'jsx',
    'optionalChaining',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'topLevelAwait'
  ]
};

// const-folding: 判断并计算“静态常量”表达式
function isConstNode(n) {
  if (!n) return false;
  return (
    t.isStringLiteral(n) ||
    t.isNumericLiteral(n) ||
    t.isBooleanLiteral(n) ||
    t.isNullLiteral(n) ||
    t.isBigIntLiteral(n) ||
    t.isRegExpLiteral(n) ||
    t.isTemplateLiteral(n) && n.expressions.every(isConstNode) ||
    t.isUnaryExpression(n) && isConstNode(n.argument) &&
      ['+', '-', '!', '~', 'void', 'typeof'].includes(n.operator) ||
    t.isBinaryExpression(n) && isConstNode(n.left) && isConstNode(n.right) ||
    t.isLogicalExpression(n) && isConstNode(n.left) && isConstNode(n.right) ||
    t.isConditionalExpression(n) &&
      isConstNode(n.test) && isConstNode(n.consequent) && isConstNode(n.alternate) ||
    t.isArrayExpression(n) && n.elements.every(e => e == null || isConstNode(e)) ||
    t.isObjectExpression(n) && n.properties.every(p =>
      t.isObjectProperty(p) && isConstNode(p.value)
    ) ||
    // arr[const]
    t.isMemberExpression(n) && !n.computed && t.isIdentifier(n.property) && false // 保守
  );
}

function evalConst(node) {
  if (!isConstNode(node)) return { ok: false };
  try {
    const code = generate(node).code;
    // 用 Function 计算，避免拿到外层作用域
    const out = Function(`return (${code});`)();
    return { ok: true, value: out };
  } catch {
    return { ok: false };
  }
}

// 提取解码函数源码 + 依赖（目前重点拉上 _0x1715）
function collectDecoderPrelude(ast, decoderNames) {
  const decls = new Map();

  function record(idName, node) {
    if (!decls.has(idName)) decls.set(idName, node);
  }

  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;
      if (decoderNames.has(name) || name === '_0x1715') {
        record(name, path.node);
      }
    },
    VariableDeclaration(path) {
      // 形如: const _0x1e61 = function(...) {...}
      for (const d of path.node.declarations) {
        const idName = t.isIdentifier(d.id) ? d.id.name : null;
        if (!idName) continue;
        const init = d.init;
        if (
          (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) &&
          (decoderNames.has(idName) || idName === '_0x1715')
        ) {
          record(idName, path.node);
        }
      }
    }
  });

  // 小优化：如果没找到 _0x1715，但文件里存在也捞一下
  if (!decls.has('_0x1715')) {
    traverse(ast, {
      FunctionDeclaration(p) {
        if (p.node.id?.name === '_0x1715') record('_0x1715', p.node);
      }
    });
  }

  // 生成 prelude 源码
  let prelude = '';
  for (const [, node] of decls) {
    prelude += generate(node, { comments: false }).code + '\n';
  }
  return prelude;
}

// 在沙箱中执行指定函数
function makeSandbox(prelude) {
  // atob/btoa polyfill（Node 环境）
  const _atob = s => Buffer.from(s, 'base64').toString('binary');
  const _btoa = s => Buffer.from(s, 'binary').toString('base64');

  const sandbox = {
    atob: _atob,
    btoa: _btoa,
    decodeURIComponent,
    encodeURIComponent,
    String,
    Number,
    Boolean,
    Buffer,
    $request: {},
    $response: {}
  };
  vm.createContext(sandbox);
  if (prelude.trim()) vm.runInContext(prelude, sandbox, { timeout: 50 });
  return sandbox;
}

function runDecoder(sandbox, fnName, args) {
  try {
    const expr = `${fnName}.apply(null, ${JSON.stringify(args)});`;
    const res = vm.runInContext(expr, sandbox, { timeout: 50 });
    return { ok: true, value: res };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e) };
  }
}

// ---------- main ----------
const inFile = process.argv[2] || 'output/output.js';
const outFile = process.argv[3] || 'output/output.deob2.js';

console.log('===== SECOND PASS START =====');

const code = read(inFile);
const ast = parse(code, parserOpts);

// 1) 找到疑似解码器：名字形如 _0xXXXX 且**经常被两参调用**
const decoderNames = new Map(); // name -> count
traverse(ast, {
  CallExpression(path) {
    const cal = path.node.callee;
    let name = null;

    // 直接调用
    if (t.isIdentifier(cal)) name = cal.name;

    // .call/.apply
    if (t.isMemberExpression(cal) && t.isIdentifier(cal.object)) {
      name = cal.object.name;
    }

    if (name && /^_0x[0-9a-z]+$/i.test(name)) {
      const argc = path.node.arguments.length;
      if (argc >= 1 && argc <= 3) {
        decoderNames.set(name, (decoderNames.get(name) || 0) + 1);
      }
    }
  }
});

const candidateSet = new Set(
  [...decoderNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6) // 取前几个高频的
    .map(([n]) => n)
);

if (candidateSet.size === 0) {
  log('未发现解码器候选，跳过');
  console.log('===== SECOND PASS END =====');
  process.exit(0);
}

log('候选：', [...candidateSet].join(', '));

// 2) 组装前置依赖（解码函数 + _0x1715）
const prelude = collectDecoderPrelude(ast, candidateSet);
const sandbox = makeSandbox(prelude);

// 3) 遍历并回填
let found = 0;
let filled = 0;

function tryFoldCall(path, calleeName, argsNodes, isApplyArray = false) {
  found++;

  // 解析实参
  let args = [];
  if (isApplyArray) {
    // fn.apply(null, [consts...])
    const arrNode = argsNodes[1];
    const ev = evalConst(arrNode);
    if (!ev.ok || !Array.isArray(ev.value)) return;
    args = ev.value;
  } else {
    for (const a of argsNodes) {
      const ev = evalConst(a);
      if (!ev.ok) return; // 有一个不是常量就放弃
      args.push(ev.value);
    }
  }

  const run = runDecoder(sandbox, calleeName, args);
  if (!run.ok) return; // 执行失败跳过

  const v = run.value;
  let rep;
  if (typeof v === 'string') rep = t.stringLiteral(v);
  else if (typeof v === 'number') rep = t.numericLiteral(v);
  else if (typeof v === 'boolean') rep = t.booleanLiteral(v);
  else return;

  path.replaceWith(rep);
  filled++;
}

traverse(ast, {
  CallExpression(path) {
    const { node } = path;
    // 直呼： _0x1e61(0x123, 'xx')
    if (t.isIdentifier(node.callee) && candidateSet.has(node.callee.name)) {
      // 全为常量？
      if (node.arguments.length >= 1 && node.arguments.every(isConstNode)) {
        tryFoldCall(path, node.callee.name, node.arguments, false);
      }
      return;
    }

    // .call/.apply
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.object)) {
      const obj = node.callee.object.name;
      const prop = t.isIdentifier(node.callee.property) ? node.callee.property.name : null;
      if (!candidateSet.has(obj) || !prop) return;

      if (prop === 'call') {
        // fn.call(thisArg, ...args) -> 取后面的参数
        const args = node.arguments.slice(1);
        if (args.length >= 1 && args.every(isConstNode)) {
          tryFoldCall(path, obj, args, false);
        }
      } else if (prop === 'apply') {
        // fn.apply(thisArg, [a,b])
        if (node.arguments.length === 2 && isConstNode(node.arguments[1])) {
          tryFoldCall(path, obj, node.arguments, true);
        }
      }
    }
  }
});

log(`发现候选调用 ${found} 处`);
log(`已静态回填 ${filled} 处`);

const out = generate(ast, { comments: true, compact: false }).code;
write(outFile, out);

console.log('===== SECOND PASS END =====');