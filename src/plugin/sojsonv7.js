/**
 * For jsjiami.com.v7
 */
import { parse } from '@babel/parser'
import _generate from '@babel/generator'
const generator = _generate.default
import _traverse from '@babel/traverse'
const traverse = _traverse.default
import * as t from '@babel/types'
import ivm from 'isolated-vm'
import PluginEval from './eval.js'
import calculateConstantExp from '../visitor/calculate-constant-exp.js'
import deleteIllegalReturn from '../visitor/delete-illegal-return.js'
import deleteUnusedVar from '../visitor/delete-unused-var.js'
import parseControlFlowStorage from '../visitor/parse-control-flow-storage.js'
import pruneIfBranch from '../visitor/prune-if-branch.js'
import splitSequence from '../visitor/split-sequence.js'

const isolate = new ivm.Isolate()
const globalContext = isolate.createContextSync()
function virtualGlobalEval(jsStr) {
  return globalContext.evalSync(String(jsStr))
}
function evalOneTime(str) {
  const vm = new ivm.Isolate()
  const ret = vm.createContextSync().evalSync(String(str))
  vm.dispose()
  return ret
}

/* ===================================================
 * v7 专用全局解密
 * =================================================== */
function decodeGlobal(ast) {
  // 删除空语句
  let i = 0
  while (i < ast.program.body.length) {
    if (t.isEmptyStatement(ast.program.body[i])) {
      ast.program.body.splice(i, 1)
    } else {
      ++i
    }
  }
  if (i < 3) {
    console.log('Error: code too short')
    return false
  }

  // 拆分第一行 version 变量声明
  traverse(ast, {
    Program(path) {
      path.stop()
      const l1 = path.get('body.0')
      if (!l1.isVariableDeclaration()) {
        return
      }
      const defs = l1.node.declarations
      const kind = l1.node.kind
      for (let i = defs.length - 1; i; --i) {
        l1.insertAfter(t.VariableDeclaration(kind, [defs[i]]))
        l1.get(`declarations.${i}`).remove()
      }
      l1.scope.crawl()
    },
  })

  let decrypt_code = [t.emptyStatement(), t.emptyStatement(), t.emptyStatement()]
  const first_line = ast.program.body[0]
  let var_version

  if (t.isVariableDeclaration(first_line)) {
    if (first_line.declarations.length) {
      var_version = first_line.declarations[0].id.name
    }
  }

  if (!var_version) {
    console.error('Line 1 is not version variable!')
    return false
  }
  console.info(`Version var: ${var_version}`)
  decrypt_code[0] = first_line
  ast.program.body.shift()

  // 查找字符串表和解密函数
  const refs = { string_var: null, string_path: null, def: [] }
  traverse(ast, {
    Identifier(path) {
      const name = path.node.name
      if (name !== var_version) return

      const up1 = path.parentPath
      if (up1.isVariableDeclarator()) {
        refs.def.push(path)
      } else if (up1.isArrayExpression()) {
        let node_table = path.getFunctionParent()
        while (node_table.getFunctionParent()) {
          node_table = node_table.getFunctionParent()
        }
        let var_string_table = node_table.node.id?.name
        refs.string_var = var_string_table
        refs.string_path = node_table
      } else if (up1.isAssignmentExpression() && path.key === 'left') {
        const up2 = up1.parentPath
        up2.replaceWith(up2.node.left)
      } else {
        console.warn(`Unexpected ref var_version: ${up1}`)
      }
    },
  })

  let var_string_table = refs.string_var
  if (!var_string_table) {
    console.error('Cannot find string table')
    return false
  }

  let decrypt_val
  let decrypt_path
  let binds = refs.string_path.scope.getBinding(var_string_table)
  function parse_main_call(path) {
    decrypt_path = path
    const node = path.node
    const copy = t.functionDeclaration(node.id, node.params, node.body)
    node.body = t.blockStatement([])
    return copy
  }

  if (refs.string_path.isVariableDeclarator()) {
    decrypt_code[1] = t.variableDeclaration('var', [refs.string_path.node])
  } else {
    decrypt_code[1] = refs.string_path.node
  }
  refs.string_path.remove()

  for (let bind of binds.referencePaths) {
    if (bind.findParent((path) => path.removed)) continue
    const parent = bind.parentPath
    if (parent.isVariableDeclarator()) {
      let top = parent.getFunctionParent()
      while (top.getFunctionParent()) {
        top = top.getFunctionParent()
      }
      decrypt_code[2] = parse_main_call(top)
      decrypt_val = top.node.id.name
      continue
    }
  }

  if (!decrypt_val) {
    console.error('Cannot find decrypt variable')
    return
  }
  console.log(`Main call wrapper name: ${decrypt_val}`)

  // 执行解密逻辑
  let content_code = ast.program.body
  ast.program.body = decrypt_code
  let { code } = generator(ast, { compact: true })
  virtualGlobalEval(code)

  ast.program.body = content_code
  const root = { name: decrypt_val, path: decrypt_path, code: '' }
  dfs([], root)

  return ast
}

/* ===================================================
 * 其他清理与还原逻辑
 * =================================================== */
function cleanSwitchCode1(path) { /* ...如前省略... */ }
function cleanSwitchCode2(path) { /* ...如前省略... */ }
function cleanDeadCode(ast) { /* ...如前省略... */ }
function removeUniqueCall(path) { /* ...如前省略... */ }
function unlockDebugger(path) { /* ...如前省略... */ }
function unlockConsole(path) { /* ...如前省略... */ }
function unlockLint(path) { /* ...如前省略... */ }
function unlockDomainLock(path) { /* ...如前省略... */ }
function unlockEnv(ast) { /* ...如前省略... */ }
function purifyFunction(path) { /* ...如前省略... */ }
function purifyCode(ast) { /* ...如前省略... */ }

/* ===================================================
 * 主导出函数
 * =================================================== */
export default function (code) {
  let ret = PluginEval.unpack(code)
  let global_eval = false
  if (ret) {
    global_eval = true
    code = ret
  }
  let ast
  try {
    ast = parse(code, { errorRecovery: true })
  } catch (e) {
    console.error(`Cannot parse code: ${e.reasonCode}`)
    return null
  }

  traverse(ast, deleteIllegalReturn)
  traverse(ast, { StringLiteral: ({ node }) => delete node.extra })
  traverse(ast, { NumericLiteral: ({ node }) => delete node.extra })

  console.log('处理全局加密...')
  ast = decodeGlobal(ast)
  if (!ast) return null

  console.log('处理代码块加密...')
  traverse(ast, parseControlFlowStorage)

  console.log('清理死代码...')
  ast = cleanDeadCode(ast)

  ast = parse(generator(ast, { comments: false }).code)

  console.log('提高代码可读性...')
  purifyCode(ast)
  ast = parse(generator(ast, { comments: false }).code)

  console.log('解除环境限制...')
  unlockEnv(ast)

  console.log('净化完成')
  code = generator(ast, { comments: false }).code
  if (global_eval) code = PluginEval.pack(code)
  return code
}