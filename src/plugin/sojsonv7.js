/**
 * sojson / jsjiami.com.v7 解壳插件（适配 $request/$response/$done）
 * 替换到：src/plugins/sojsonv7.js
 */
import { parse } from '@babel/parser'
import _generate from '@babel/generator'
const generate = _generate.default
import _traverse from '@babel/traverse'
const traverse = _traverse.default
import * as t from '@babel/types'
import ivm from 'isolated-vm'

// 你工程里的通用 visitor（沿用你的路径）
import PluginEval from './eval.js'
import calculateConstantExp from '../visitor/calculate-constant-exp.js'
import deleteIllegalReturn from '../visitor/delete-illegal-return.js'
import deleteUnusedVar from '../visitor/delete-unused-var.js'
import parseControlFlowStorage from '../visitor/parse-control-flow-storage.js'
import pruneIfBranch from '../visitor/prune-if-branch.js'
import splitSequence from '../visitor/split-sequence.js'

/* ------------------------- 沙箱：最小运行环境 ------------------------- */
const isolate = new ivm.Isolate({ memoryLimit: 128 })
const context = isolate.createContextSync()
const prelude = `
;(() => {
  const g = (typeof globalThis!=='undefined')?globalThis:(typeof global!=='undefined'?global:window);
  g.global = g.window = g.self = g;

  if (!g.atob) g.atob = (s)=> {
    const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str=String(s).replace(/=+$/,''); let out='', bc=0, bs, buffer, idx=0;
    for (; buffer=str.charAt(idx++);~buffer&&(bs=bc%4?bs*64+buffer:buffer, bc++%4)? out += String.fromCharCode(255 & bs >> (-2*bc & 6)) : 0) {
      buffer = ABC.indexOf(buffer);
    }
    return out;
  };
  if (!g.btoa) g.btoa = (s)=> {
    const ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str=String(s), out='', i=0;
    for (; i<str.length;) {
      const c1=str.charCodeAt(i++), c2=str.charCodeAt(i++), c3=str.charCodeAt(i++);
      const e1=c1>>2, e2=(c1&3)<<4 | c2>>4, e3=isNaN(c2)?64:((c2&15)<<2 | c3>>6), e4=isNaN(c2)?64:(isNaN(c3)?64:(c3&63));
      out += ABC.charAt(e1)+ABC.charAt(e2)+ABC.charAt(e3)+ABC.charAt(e4);
    }
    return out;
  };

  if (!g.$request)  g.$request  = { body:'', headers:{}, url:'', method:'' };
  if (!g.$response) g.$response = { body:'{}', headers:{} };
  if (!g.$done)     g.$done = function(x){ return x };
  if (!g.console)   g.console = { log(){}, warn(){}, error(){} };
})();`
context.evalSync(prelude)

function virtualEval(js) { return context.evalSync(String(js)) }
function evalOneTime(str) {
  const iso = new ivm.Isolate({ memoryLimit: 64 })
  const ctx = iso.createContextSync()
  ctx.evalSync(prelude)
  const ret = ctx.evalSync(String(str))
  iso.dispose()
  return ret
}

/* ------------------------- 解全局字符串索引 ------------------------- */
function decodeGlobal(ast) {
  // 先去空语句
  ast.program.body = ast.program.body.filter(n => !t.isEmptyStatement(n))

  const first = ast.program.body[0]
  let var_version = null
  if (t.isVariableDeclaration(first) && first.declarations.length) {
    var_version = first.declarations[0].id.name
  }
  // 为了不破坏结构，不移动首行
  // 下面寻找基于 version 的字符串表（原逻辑）
  let refs = { string_var: null, string_path: null }

  if (var_version) {
    traverse(ast, {
      Identifier(path) {
        if (path.node.name !== var_version) return
        const up = path.parentPath
        if (up.isArrayExpression()) {
          // 找到数组字面量所在顶层（可能是 var 声明或函数）
          let node_table = path.getFunctionParent() || up
          while (node_table.getFunctionParent()) node_table = node_table.getFunctionParent()
          let var_string_table
          if (node_table.isFunctionDeclaration() && node_table.node.id) {
            var_string_table = node_table.node.id.name
          } else {
            while (!node_table.isVariableDeclarator()) node_table = node_table.parentPath
            var_string_table = node_table.node.id.name
          }
          // 成员访问的排除
          let valid = true
          up.traverse({
            MemberExpression(p){ valid = false; p.stop() }
          })
          if (valid) {
            refs.string_var = var_string_table
            refs.string_path = node_table
          }
        }
      }
    })
  }

  // ---------- Fallback：直接搜索 _0x1715 / _0x1e61 结构 ----------
  if (!refs.string_var) {
    let stringFuncPath = null, indexerPath = null
    let stringFuncName = null, indexerName = null

    // 找 _0x1715()
    traverse(ast, {
      FunctionDeclaration(p){
        if (stringFuncPath) return
        const n = p.node, body = n.body?.body || []
        const last = body[body.length-1]
        if (!n.id || !last || !t.isReturnStatement(last) || !t.isCallExpression(last.argument)) return
        if (!t.isIdentifier(last.argument.callee, { name: n.id.name })) return
        const reassign = body.find(s =>
          t.isExpressionStatement(s) &&
          t.isAssignmentExpression(s.expression) &&
          t.isIdentifier(s.expression.left, { name: n.id.name }) &&
          t.isFunctionExpression(s.expression.right)
        )
        if (!reassign) return
        stringFuncPath = p
        stringFuncName = n.id.name
      }
    })

    // 找 _0x1e61()
    traverse(ast, {
      FunctionDeclaration(p){
        if (!stringFuncName || indexerPath) return
        let hit = false
        p.traverse({
          CallExpression(q){
            if (t.isIdentifier(q.node.callee, { name: stringFuncName })) { hit = true; q.stop() }
          }
        })
        if (hit) { indexerPath = p; indexerName = p.node.id.name }
      }
    })

    if (stringFuncPath && indexerPath) {
      // 可能的旋转/激活片段（sequence/if）
      const aux = []
      traverse(ast, {
        SequenceExpression(p){
          const s = p.toString()
          if (s.includes(stringFuncName)) aux.push(t.expressionStatement(p.node))
        },
        IfStatement(p){
          const s = p.toString()
          if (s.includes(stringFuncName)) aux.push(p.node)
        }
      })
      // 在沙箱中声明并激活
      const boot = t.program([ stringFuncPath.node, indexerPath.node, ...aux ])
      virtualEval(generate(boot, { compact:true }).code)

      // 替换所有索引调用为明文
      traverse(ast, {
        CallExpression(p){
          if (!t.isIdentifier(p.node.callee, { name: indexerName })) return
          try {
            const expr = generate(p.node, { compact:true }).code
            const val = virtualEval(expr)
            p.replaceWith(t.valueToNode(val))
          } catch {}
        }
      })
      // 删定义，避免重复
      stringFuncPath.remove()
      indexerPath.remove()
      return ast
    } else {
      console.error('Cannot find string table (fallback failed)')
      return false
    }
  }

  // 如果走到这里，说明基于 version 的路径有效
  // 取出字符串表那段 & 主解码函数（尽量不改其他结构）
  const decrypt_code = [ t.emptyStatement(), t.emptyStatement(), t.emptyStatement() ]
  decrypt_code[0] = first

  let tablePath = refs.string_path
  let tableDeclNode = tablePath.isVariableDeclarator()
    ? t.variableDeclaration('var', [tablePath.node])
    : tablePath.node
  decrypt_code[1] = tableDeclNode
  tablePath.remove()

  let decrypt_name = null, decrypt_path = null
  const binds = tablePath.scope.getBinding(refs.string_var)
  if (binds) {
    for (const ref of binds.referencePaths) {
      if (ref.findParent(p => p.removed)) continue
      const parent = ref.parentPath
      // 主解码函数：包裹最外层 function
      if (parent.isVariableDeclarator() || (parent.isCallExpression() && !parent.node.arguments.length)) {
        let top = parent.getFunctionParent()
        while (top.getFunctionParent()) top = top.getFunctionParent()
        decrypt_path = top
        decrypt_name = top.node.id?.name
        const copy = t.functionDeclaration(top.node.id, top.node.params, top.node.body)
        top.node.body = t.blockStatement([])
        decrypt_code[2] = copy
      } else if (parent.isSequenceExpression()) {
        decrypt_code.push(t.expressionStatement(parent.node))
        const up = parent.parentPath
        if (up.isIfStatement()) up.remove(); else parent.remove()
      }
    }
  }

  if (!decrypt_name || !decrypt_path) {
    console.error('Cannot find decrypt variable')
    return false
  }

  // 运行解密段，令索引器可用
  const saved = ast.program.body
  ast.program.body = decrypt_code
  virtualEval(generate(ast, { compact:true }).code)
  ast.program.body = saved

  // 把所有可直接求值的调索引调用/成员访问转成字面量
  function replaceByEval(path) {
    try {
      const code = path.toString()
      const val  = virtualEval(code)
      path.replaceWith(t.valueToNode(val))
    } catch {}
  }
  decrypt_path.parentPath.scope.crawl()
  const root = { name: decrypt_name, path: decrypt_path }

  // 深度展开：遍历解码函数引用，逐个 eval
  ;(function dfs(item){
    const binding = (item.path.getFunctionParent() || item.path.scope.path).scope.getBinding(item.name)
    if (!binding) return
    for (const ref of binding.referencePaths) {
      if (ref.findParent(p => p.removed)) continue
      const parent = ref.parentPath
      if (ref.key === 'object')      replaceByEval(parent)               // obj['foo']
      else if (ref.key === 'callee') replaceByEval(ref.parentPath)       // _0x1e61(...)
      else if (ref.key === 'init' || ref.key === 'right') {
        const np = ref.parentPath
        const nextName = (ref.key === 'init') ? np.node.id.name : np.node.left.name
        dfs({ name: nextName, path: np })
      }
    }
    item.path.remove()
    binding.scope.crawl()
  })(root)

  return ast
}

/* ------------------------- 扁平控制/死代码/净化 ------------------------- */
function cleanSwitchCode1(path) {
  const n = path.node
  if (!(t.isBooleanLiteral(n.test) || t.isUnaryExpression(n.test))) return
  if (!(n.test.prefix || n.test.value)) return
  if (!t.isBlockStatement(n.body)) return
  const body = n.body.body
  if (!t.isSwitchStatement(body[0]) || !t.isMemberExpression(body[0].discriminant) || !t.isBreakStatement(body[1])) return

  const sw = body[0]
  const arrName = sw.discriminant.object.name
  const argName = sw.discriminant.property.argument.name

  let arr = []
  path.getAllPrevSiblings().forEach(pre => {
    if (!pre.isVariableDeclaration()) return
    const { id, init } = pre.node.declarations[0]
    if (arrName === id.name) { arr = init.callee.object.value.split('|'); pre.remove() }
    if (argName === id.name) { pre.remove() }
  })

  const cases = sw.cases
  const out = []
  arr.map(idx => {
    let ok = true
    idx = parseInt(idx)
    while (ok && idx < cases.length) {
      const cons = cases[idx].consequent
      for (let i=0;i<cons.length;i++){
        const s = cons[i]
        if (t.isContinueStatement(s)) { ok=false; break }
        if (t.isReturnStatement(s)) { ok=false; out.push(s); break }
        if (!t.isBreakStatement(s)) out.push(s)
      }
      idx++
    }
  })
  path.replaceInline(out)
}

function cleanSwitchCode2(path) {
  const n = path.node
  if (n.init || n.test || n.update) return
  if (!t.isBlockStatement(n.body)) return
  const body = n.body.body
  if (!t.isSwitchStatement(body[0]) || !t.isMemberExpression(body[0].discriminant) || !t.isBreakStatement(body[1])) return

  const sw = body[0]
  const arrName = sw.discriminant.object.name

  let arr = null
  for (const pre of path.getAllPrevSiblings()) {
    if (!pre.isVariableDeclaration()) continue
    const code = '' + pre
    try {
      arr = evalOneTime(code + `;${arrName}.join('|')`).split('|')
      break
    } catch {}
  }
  if (!Array.isArray(arr)) return

  const cmap = {}
  for (const c of sw.cases) cmap[c.test.value] = c.consequent

  const out = []
  arr.map(idx => {
    let ok = true
    while (ok && idx < arr.length) {
      const cons = cmap[idx]
      for (let i=0;i<cons.length;i++){
        const s = cons[i]
        if (t.isContinueStatement(s)) { ok=false; break }
        if (t.isReturnStatement(s)) { ok=false; out.push(s); break }
        if (!t.isBreakStatement(s)) out.push(s)
      }
      idx++
    }
  })
  path.replaceInline(out)
}

function cleanDeadCode(ast) {
  traverse(ast, calculateConstantExp)
  traverse(ast, pruneIfBranch)
  traverse(ast, { WhileStatement: { exit: cleanSwitchCode1 } })
  traverse(ast, { ForStatement:   { exit: cleanSwitchCode2 } })
  return ast
}

function FormatMember(path){
  const n = path.node
  if (!t.isStringLiteral(n.property)) return
  if (n.computed !== true) return
  if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(n.property.value)) return
  n.property = t.identifier(n.property.value)
  n.computed = false
}

function purifyFunction(path){
  const left = path.get('left'), right = path.get('right')
  if (!left.isIdentifier() || !right.isFunctionExpression()) return
  const params = right.node.params
  if (params.length !== 2) return
  const body = right.node.body.body
  if (body.length !== 1 || !t.isReturnStatement(body[0])) return
  const ret = body[0].argument
  if (!t.isBinaryExpression(ret, { operator:'+' })) return
  if (ret.left?.name !== params[0].name || ret.right?.name !== params[1].name) return

  const name = left.node.name
  const fnPath = path.getFunctionParent() || path.scope.path
  fnPath.traverse({
    CallExpression(p){
      if (!t.isIdentifier(p.node.callee, { name })) return
      const a = p.node.arguments
      p.replaceWith(t.binaryExpression('+', a[0], a[1]))
    }
  })
  path.remove()
}

function purifyCode(ast){
  traverse(ast, { AssignmentExpression: purifyFunction })
  traverse(ast, calculateConstantExp)
  traverse(ast, { MemberExpression: FormatMember })
  traverse(ast, splitSequence)
  traverse(ast, { EmptyStatement(p){ p.remove() } })
  traverse(ast, deleteUnusedVar)
}

/* ------------------------- 对外导出：主流程 ------------------------- */
export default function (inputCode) {
  let code = inputCode
  let packed = PluginEval.unpack(code)
  let wrapped = false
  if (packed) { wrapped = true; code = packed }

  let ast
  try {
    ast = parse(code, { errorRecovery: true })
  } catch (e) {
    console.error(`Cannot parse code: ${e.reasonCode}`)
    return null
  }

  traverse(ast, deleteIllegalReturn)
  traverse(ast, { StringLiteral: ({node}) => { delete node.extra } })
  traverse(ast, { NumericLiteral: ({node}) => { delete node.extra } })

  console.log('处理全局加密...')
  ast = decodeGlobal(ast)
  if (!ast) return null

  console.log('处理代码块加密...')
  traverse(ast, parseControlFlowStorage)

  console.log('清理死代码...')
  ast = cleanDeadCode(ast)

  // 刷新一次
  ast = parse(generate(ast, { comments:false, jsescOption:{ minimal:true } }).code)

  console.log('提高代码可读性...')
  purifyCode(ast)
  ast = parse(generate(ast, { comments:false }).code)

  console.log('净化完成')
  code = generate(ast, { comments:false, jsescOption:{ minimal:true } }).code

  if (wrapped) code = PluginEval.pack(code)
  return code
}