// src/plugin/extra-codecs/second-pass.js
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { parse } from '@babel/parser';
import traverseMod from '@babel/traverse';
const traverse = traverseMod.default || traverseMod;
import generatorMod from '@babel/generator';
const generate = generatorMod.default || generatorMod;
import * as t from '@babel/types';

const [, , inFile = 'output/output.js', outFile = 'output/output.deob2.js'] = process.argv;

console.log('===== SECOND PASS START =====');

if (!fs.existsSync(inFile)) {
  console.error(`[second-pass] 找不到输入文件: ${inFile}`);
  process.exit(0);
}
const code = fs.readFileSync(inFile, 'utf8');

const ast = parse(code, {
  sourceType: 'unambiguous',
  plugins: [
    'jsx',
    'classProperties',
    'optionalChaining',
    'dynamicImport',
    'objectRestSpread',
    'topLevelAwait',
    'typescript',
    ['decorators', { decoratorsBeforeExport: true }],
  ],
});

const HEX_ID = /^_0x[0-9a-f]+$/i;
const HEURISTICS = [
  'fromCharCode',
  'charCodeAt',
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=',
  'String.fromCharCode',
  '%',
];

const decoderCandidates = new Set(); // 真·解码函数
const aliasMap = new Map();          // name -> target name

// 收集候选 + 别名（变量声明 & 赋值表达式）
traverse(ast, {
  VariableDeclarator(p) {
    const { id, init } = p.node;
    // 别名：const a = b;
    if (t.isIdentifier(id) && t.isIdentifier(init) && HEX_ID.test(id.name) && HEX_ID.test(init.name)) {
      aliasMap.set(id.name, init.name);
    }
    // 形如 const foo=function(){}/()=>{}
    if (
      t.isIdentifier(id) &&
      HEX_ID.test(id.name) &&
      (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init))
    ) {
      const body = code.slice(init.start, init.end);
      if (HEURISTICS.some((k) => body.includes(k))) decoderCandidates.add(id.name);
    }
  },
  AssignmentExpression(p) {
    // a = b
    const { left, right } = p.node;
    if (t.isIdentifier(left) && t.isIdentifier(right) && HEX_ID.test(left.name) && HEX_ID.test(right.name)) {
      aliasMap.set(left.name, right.name);
    }
  },
  FunctionDeclaration(p) {
    const id = p.node.id;
    if (id && HEX_ID.test(id.name)) {
      const body = code.slice(p.node.start, p.node.end);
      if (HEURISTICS.some((k) => body.includes(k))) decoderCandidates.add(id.name);
    }
  },
});

// 将别名链全部打平
const decoderNames = new Set([...decoderCandidates]);
function resolveAlias(name) {
  const seen = new Set();
  let cur = name;
  while (aliasMap.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = aliasMap.get(cur);
  }
  return cur;
}
let changed = true;
while (changed) {
  changed = false;
  for (const [name, target] of aliasMap.entries()) {
    const root = resolveAlias(target);
    if (decoderNames.has(root) && !decoderNames.has(name)) {
      decoderNames.add(name);
      changed = true;
    }
  }
}

if (decoderNames.size === 0) {
  console.log('[second-pass] 未发现解码器候选，跳过');
  safeWrite(outFile, code);
  console.log('===== SECOND PASS END =====');
  process.exit(0);
}

// 建沙盒，尽量避免副作用
const sandbox = mkSandbox();
try {
  vm.runInNewContext(code, sandbox, { timeout: 150 });
} catch (e) {
  console.log('[second-pass] sandbox run error:', String(e?.message || e));
}

// 打印最终名字集合（含别名）
console.log('[second-pass] 可用解码名集合:', [...decoderNames].join(', '));

let found = 0;
let filled = 0;

traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;
    if (!t.isIdentifier(callee)) return;

    // 把别名解析到根，再判断是否属于解码器家族
    const rootName = resolveAlias(callee.name);
    if (!decoderNames.has(rootName)) return;

    found++;

    // 收集参数：优先 evaluate，自信则用；不自信时，若本身是字面量也用
    const argPaths = path.get('arguments');
    const args = [];
    for (const ap of argPaths) {
      const eva = ap.evaluate();
      if (eva.confident) {
        args.push(eva.value);
        continue;
      }
      const n = ap.node;
      if (
        t.isStringLiteral(n) ||
        t.isNumericLiteral(n) ||
        t.isBooleanLiteral(n) ||
        t.isNullLiteral(n)
      ) {
        args.push(n.value);
      } else {
        return; // 仍不行，放弃这次替换
      }
    }

    // 在沙盒调用根函数名（注意：调用别名也可，但用根名更稳）
    const fn = sandbox[rootName] || sandbox[callee.name];
    if (typeof fn !== 'function') return;

    let value;
    try {
      value = fn(...args);
    } catch {
      return;
    }

    try {
      path.replaceWith(t.valueToNode(value));
      filled++;
    } catch {
      /* ignore */
    }
  },
});

console.log(`[second-pass] 已静态回填 ${filled} 处（候选 ${found} 处）`);

const { code: out } = generate(ast, { comments: true });
safeWrite(outFile, out);
console.log('===== SECOND PASS END =====');

// ---------- helpers ----------
function safeWrite(file, content) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content);
}
function mkSandbox() {
  const noop = () => {};
  const fakeConsole = { log: noop, info: noop, warn: noop, error: noop, debug: noop };
  const box = {
    $request: {},
    $response: { body: '{}' },
    $done: noop,
    $notify: noop,
    $prefs: { valueForKey: () => null, setValueForKey: noop },
    $persistentStore: { write: noop, read: () => '' },
    $task: { fetch: () => Promise.reject(new Error('blocked')) },
    setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
    console: fakeConsole,
  };
  box.global = box; box.globalThis = box; box.window = box; box.self = box;
  return box;
}