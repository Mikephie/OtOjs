// plugins/extra-codecs/common.js
const babel = require('@babel/core');
const t = require('@babel/types');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const vm = require('node:vm');

function parse(code) {
  return parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'classProperties', 'optionalChaining']
  });
}

function print(ast) { return generate(ast, { retainLines: false }).code; }

// 在安全沙箱里仅执行“解码相关函数”，不提供 Node 能力
function evalInSandbox(src, context = {}) {
  const sandbox = vm.createContext(Object.assign(Object.create(null), context));
  return vm.runInContext(src, sandbox, { timeout: 2000 });
}

module.exports = { babel, t, parse, print, traverse, generate, evalInSandbox };