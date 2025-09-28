import { parse } from '@babel/parser'
import _generate from '@babel/generator'
const generator = _generate.default
import _traverse from '@babel/traverse'
const traverse = _traverse.default
import * as t from '@babel/types'

/* -------------------- 环境与工具 -------------------- */
const isNode = typeof process !== 'undefined' && process.versions && process.versions.node
let vmMod = null
try { if (isNode) { vmMod = require('vm') } } catch { /* ignore */ }

/* 将字符串中的 \n \t 等转义展开为真实字符，防止“一行糊在一起” */
function expandEscapedNewlines(s) {
  if (typeof s !== 'string') return s
  const moreEscaped = (s.match(/\\n/g) || []).length > (s.match(/\n/g) || []).length
  if (!moreEscaped) return s
  try {
    const wrapped = '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
    return JSON.parse(wrapped)
  } catch {
    return s
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
  }
}

/* 轻微断行，便于可读（不会改变语义） */
function softBreak(s) {
  if (typeof s !== 'string') return s
  if ((s.match(/\n/g) || []).length >= 5) return s
  return s
    .replace(/;\s*(?!\n)/g, ';\n')
    .replace(/\}\s*(?!\n)/g, '}\n')
    .replace(/\)\s*;\s*(?!\n)/g, ');\n')
}

/* -------------------- 关键补丁：提取 eval 之前的头部 -------------------- */
/**
 * 有些混淆会把“横幅注释/三行说明/变量声明”放在 eval 之前。
 * 我们把它切出来再在成功解包后拼回，避免“前面三行丢失”。
 */
function extractHeaderBeforeEval(code) {
  if (typeof code !== 'string') return { header: '', body: code }
  // 尽量稳健：匹配常见写法 eval( / window.eval( / globalThis.eval(
  const re = /\b(?:window\.|globalThis\.)?eval\s*\(/g
  const m = re.exec(code)
  if (!m) return { header: '', body: code }
  const idx = m.index
  const header = code.slice(0, idx).trimEnd()
  const body = code.slice(idx)
  return { header, body }
}

/* -------------------- Packer 识别与解包 -------------------- */
/**
 * Dean Edwards Packer解包参数提取
 * @param {string} code
 * @returns {object|null}
 */
function unpackDeanEdwardsPacker(code) {
  const packerPattern =
    /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{[\s\S]*?\}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\s*\.split\s*\(\s*'([^']+)'\s*\)\s*,\s*(\d+)\s*,\s*\{\s*\}\s*\)\s*\)/
  const m = code.match(packerPattern)
  if (!m) return null
  return {
    payload: m[1],
    radix: parseInt(m[2]),
    count: parseInt(m[3]),
    words: m[4].split(m[5]),
    countCheck: parseInt(m[6])
  }
}

/**
 * 执行 Packer 解包
 * @param {{payload:string, radix:number, count:number, words:string[]}} params
 * @returns {string}
 */
function executeDeanEdwardsUnpacker(params) {
  const { payload, radix, count, words } = params
  const decode = function (c) {
    c = parseInt(c, radix)
    return (c < radix ? '' : decode(Math.floor(c / radix))) +
      ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36))
  }
  const dict = {}
  for (let i = 0; i < count; i++) {
    const key = decode(i)
    dict[key] = words[i] || key
  }
  let out = payload
  for (let i = count - 1; i >= 0; i--) {
    const key = decode(i)
    if (dict[key]) {
      const re = new RegExp('\\b' + key + '\\b', 'g')
      out = out.replace(re, dict[key])
    }
  }
  return out
}

/* -------------------- 主解包：多策略增强版 -------------------- */
/**
 * 解包 eval 加密的代码（增强版）
 * @param {string} code
 * @returns {string|null}
 */
function unpack(code) {
  try {
    if (typeof code !== 'string' || !code.includes('eval')) return null
    const startTime = Date.now()

    // 关键：先切出 header，后续所有成功返回都要把 header 拼回
    const { header, body } = extractHeaderBeforeEval(code)
    const glue = header ? (header.endsWith('\n') ? '' : '\n') : ''

    /* 1) Dean Edwards Packer */
    try {
      const params = unpackDeanEdwardsPacker(body)
      if (params) {
        let result = executeDeanEdwardsUnpacker(params)
        if (result && result.includes('eval')) result = unpack(result) || result
        const finalText = expandEscapedNewlines(result)
        return header ? (header + glue + finalText) : finalText
      }
    } catch { /* 继续其它方法 */ }

    /* 2) Node VM 沙箱（仅 Node 可用） */
    if (vmMod) {
      try {
        let result = null
        const sandbox = {
          eval: function (x) { result = x; return x },
          String, parseInt, RegExp, console
        }
        vmMod.createContext(sandbox)
        vmMod.runInContext(body, sandbox, { timeout: 5000 })
        if (result) {
          if (typeof result === 'string' && result.includes('eval')) result = unpack(result) || result
          const finalText = expandEscapedNewlines(result)
          return header ? (header + glue + finalText) : finalText
        }
      } catch { /* 继续 */ }
    }

    /* 3) Function 构造器：将 eval 替换为捕获函数 */
    try {
      let captured = null
      const modified = body.replace(/\beval\s*\(/g, '(function(__x){captured=__x;return __x;})(')
      const fn = new Function('captured', 'String', 'parseInt', 'RegExp', `
        "use strict";
        ${modified}
        return captured;
      `)
      let result = fn(null, String, parseInt, RegExp)
      if (result) {
        if (typeof result === 'string' && result.includes('eval')) result = unpack(result) || result
        const finalText = expandEscapedNewlines(result)
        return header ? (header + glue + finalText) : finalText
      }
    } catch { /* 继续 */ }

    /* 4) Babel AST：抓 eval(<call|string>) */
    try {
      const ast = parse(body, { errorRecovery: true, sourceType: 'script' })
      let result = null
      traverse(ast, {
        CallExpression(path) {
          if (t.isIdentifier(path.node.callee, { name: 'eval' })) {
            const arg = path.node.arguments?.[0]
            if (t.isCallExpression(arg)) {
              try {
                const evalCode = generator(path.node).code
                const fn = new Function('return ' + evalCode.replace(/^eval\(/, '('))
                result = fn()
                path.stop()
              } catch { /* ignore */ }
            } else if (t.isStringLiteral(arg)) {
              result = arg.value
              path.stop()
            }
          }
        }
      })
      if (result) {
        if (typeof result === 'string' && result.includes('eval')) result = unpack(result) || result
        const finalText = expandEscapedNewlines(result)
        return header ? (header + glue + finalText) : finalText
      }
    } catch { /* 继续 */ }

    // console.log('[eval] 所有方法都失败')
    return null
  } catch (err) {
    // console.error('[eval] 解包异常:', err)
    return null
  }
}

/* -------------------- 打包（保持你原有实现） -------------------- */
function pack(code) {
  let ast1 = parse('(function(){}())')
  let ast2 = parse(code)
  traverse(ast1, {
    FunctionExpression(path) {
      let body = t.blockStatement(ast2.program.body)
      path.replaceWith(t.functionExpression(null, [], body))
      path.stop()
    },
  })
  return generator(ast1, { minified: false }).code
}

/* -------------------- 检测 & 导出 -------------------- */
function detect(code) {
  return typeof code === 'string' && code.includes('eval')
}

export default {
  unpack,
  pack,
  detect,
  // 兼容你框架的插件接口
  plugin: unpack
}