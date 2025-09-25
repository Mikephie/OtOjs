// plugin/extra-codecs/common.js
import * as babel from '@babel/core';
import * as t from '@babel/types';
import parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import vm from 'node:vm';

export function parse(code) {
  return parser.parse(code, {
    sourceType: 'unambiguous',
    plugins: ['jsx', 'classProperties', 'optionalChaining']
  });
}
export function print(ast) {
  return generate.default(ast, { retainLines: false }).code;
}

// 安全沙箱：只用于执行“解码函数”，不暴露 Node 能力
export function evalInSandbox(src, context = {}) {
  const sandbox = vm.createContext(Object.assign(Object.create(null), context));
  return vm.runInContext(src, sandbox, { timeout: 2000 });
}

export { babel, t, traverse, generate };