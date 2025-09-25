// src/plugin/extra-codecs/second-pass.js
// 兼容 ESM，且对 @babel/* 做 default 兜底，解决 “is not a function”
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { parse } from '@babel/parser';

import traverseMod from '@babel/traverse';
const traverse = traverseMod.default || traverseMod;

import generatorMod from '@babel/generator';
const generate = generatorMod.default || generatorMod;

import * as t from '@babel/types';

// ------------------------- CLI -------------------------
const [, , inFile = 'output/output.js', outFile = 'output/output.deob2.js'] = process.argv;

console.log('===== SECOND PASS START =====');

if (!fs.existsSync(inFile)) {
  console.error(`[second-pass] 找不到输入文件: ${inFile}`);
  process.exit(0); // 不报错地退出，好串 workflow
}

const code = fs.readFileSync(inFile, 'utf8');

// ---------------------- 1) 解析 AST ---------------------
const ast = parse(code, {
  sourceType: 'unambiguous',
  plugins: [
    'jsx',
    'classProperties',
    'optionalChaining',
    'dynamicImport',
    'objectRestSpread',
    'topLevelAwait',
    // 如源里有 TS/装饰器，也能兼容
    'typescript',
    ['decorators', { decoratorsBeforeExport: true }],
  ],
});

// ---------------------- 2) 识别解码器 ---------------------
/**
 * 目标：找出形如 `_0x1e61` 的“主解码器”及其别名 `const _0xc3dd0a = _0x1e61`
 * 规则（尽量通用）：
 *  - 函数名形如 /^_0x[a-f0-9]+$/i 的 FunctionDeclaration/FunctionExpression
 *  - 函数体里包含典型字串：'fromCharCode' / 'charCodeAt' / base64 字典 / rc4 S-Box 初始化等
 *  - 别名：VariableDeclarator 的 init 是上面任何一个 id
 */

const HEX_ID = /^_0x[0-9a-f]+$/i;
const HEURISTICS = [
  'fromCharCode',
  'charCodeAt',
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=',
  '%', // decodeURIComponent 百分号组装
  'String.fromCharCode',
];

const decoderCandidates = new Set(); // 可能的主函数名
const aliasMap = new Map(); // name -> init.name

// 先扫一遍：收集候选解码函数 & 别名关系
traverse(ast, {
  VariableDeclarator(p) {
    const id = p.node.id;
    const init = p.node.init;
    if (t.isIdentifier(id) && HEX_ID.test(id.name) && t.isIdentifier(init) && HEX_ID.test(init.name)) {
      aliasMap.set(id.name, init.name);
    }
  },
  FunctionDeclaration(p) {
    const id = p.node.id;
    if (id && HEX_ID.test(id.name)) {
      const body = code.slice(p.node.start, p.node.end);
      if (HEURISTICS.some((k) => body.includes(k))) {
        decoderCandidates.add(id.name);
      }
    }
  },
  VariableDeclarator(p) {
    // const foo = function (...) {...}
    const id = p.node.id;
    const init = p.node.init;
    if (t.isIdentifier(id) && HEX_ID.test(id.name) && (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init))) {
      const body = code.slice(init.start, init.end);
      if (HEURISTICS.some((k) => body.includes(k))) {
        decoderCandidates.add(id.name);
      }
    }
  },
});

// 沿着别名链传递：把所有 alias 收进来
const decoderNames = new Set([...decoderCandidates]);
let changed = true;
while (changed) {
  changed = false;
  for (const [name, target] of aliasMap.entries()) {
    if (decoderNames.has(target) && !decoderNames.has(name)) {
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

// ---------------------- 3) 建沙盒并预载代码 ---------------------
/**
 * 我们把整个源代码喂进 VM，但把可能产生副作用的宿主 API 全部桩掉
 * （$request/$response/$done/console/setTimeout 等），并限制超时。
 */
const sandbox = mkSandbox();
try {
  vm.runInNewContext(code, sandbox, { timeout: 150 });
} catch (e) {
  // 不中断：就算整段脚本会报错，解码器函数通常已定义
  console.log('[second-pass] sandbox run error (可能有副作用代码):', String(e && e.message || e));
}

// ---------------------- 4) 静态求值 & 回填 ---------------------
let found = 0;
let filled = 0;

const decoderNameList = [...decoderNames];
console.log(`[second-pass] 发现候选调用 ${decoderNameList.length} 个别名: ${decoderNameList.join(', ')}`);

traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;
    if (!t.isIdentifier(callee)) return;
    if (!decoderNames.has(callee.name)) return;

    found++;

    // 尝试静态求值每个参数（babel-traverse 的 path.evaluate）
    const argPaths = path.get('arguments');
    const args = [];
    for (const ap of argPaths) {
      const eva = ap.evaluate();
      if (eva.confident) {
        args.push(eva.value);
      } else {
        // 不是常量就放弃这次替换
        return;
      }
    }

    // 在沙盒中调用真实函数，拿到运行期结果
    const fn = sandbox[callee.name];
    if (typeof fn !== 'function') return;
    let value;
    try {
      value = fn(...args);
    } catch (e) {
      return; // 调用失败就不替换
    }

    try {
      const node = t.valueToNode(value);
      path.replaceWith(node);
      filled++;
    } catch {
      // 结果不是 AST 支持的字面量，忽略
    }
  },
});

// ---------------------- 5) 输出 ---------------------
console.log(`[second-pass] 已静态回填 ${filled} 处（候选 ${found} 处）`);

const { code: out } = generate(ast, { comments: true });
safeWrite(outFile, out);

console.log('===== SECOND PASS END =====');

// ===================== 辅助函数 ======================
function safeWrite(file, content) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content);
}

function mkSandbox() {
  const noop = () => {};
  const fakeConsole = {
    log: noop,
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
  };
  const box = {
    // 常见脚本运行环境桩
    $request: {},
    $response: { body: '{}' },
    $notify: noop,
    $persistentStore: { write: noop, read: () => '' },
    $done: noop,
    $prefs: { valueForKey: () => null, setValueForKey: noop },
    $task: { fetch: () => Promise.reject(new Error('blocked')) },
    // 定时器桩
    setTimeout: noop,
    setInterval: noop,
    clearTimeout: noop,
    clearInterval: noop,
    // 环境
    console: fakeConsole,
    globalThis: null,
    window: null,
    self: null,
  };
  box.global = box;
  box.globalThis = box;
  box.window = box;
  box.self = box;
  return box;
}