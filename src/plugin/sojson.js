/**
 * 在 babel_asttool.js 的基础上修改而来 —— 保留并拼回开头三句
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
import deleteUnusedVar from '../visitor/delete-unused-var.js'
import parseControlFlowStorage from '../visitor/parse-control-flow-storage.js'
import pruneIfBranch from '../visitor/prune-if-branch.js'
import splitSequence from '../visitor/split-sequence.js'

/* -------------------- 虚拟全局执行环境 -------------------- */
const isolate = new ivm.Isolate()
const globalContext = isolate.createContextSync()
function virtualGlobalEval(jsStr) {
  return globalContext.evalSync(String(jsStr))
}

/* -------------------- 全局解密：保留“前3句”为 header -------------------- */
function decodeGlobal(ast) {
  // 清理空语句
  let i = 0
  while (i < ast.program.body.length) {
    if (t.isEmptyStatement(ast.program.body[i])) {
      ast.program.body.splice(i, 1)
    } else {
      ++i
    }
  }

  // 至少需要前3句：签名信息、预处理函数、解密函数
  if (ast.program.body.length < 3) {
    console.log('Error: code too short')
    return null
  }

  // 分离解密语句与内容语句
  const decrypt_code = ast.program.body.slice(0, 3)

  // 生成“开头三句”的源码文本，保存为 header（稍后拼回）
  const headerText = generator(
    t.program(decrypt_code),
    { comments: true, jsescOption: { minimal: true } }
  ).code

  // 找到解密函数名
  let decrypt_fun = decrypt_code[2]
  if (t.isExpressionStatement(decrypt_fun)) {
    decrypt_fun = decrypt_code[1]
  }
  let decrypt_val
  if (t.isVariableDeclaration(decrypt_fun)) {
    decrypt_val = decrypt_fun.declarations[0].id.name
  } else if (t.isFunctionDeclaration(decrypt_fun)) {
    decrypt_val = decrypt_fun.id.name
  } else {
    console.log('Error: cannot find decrypt variable')
    return null
  }
  console.log(`主加密变量: ${decrypt_val}`)

  // 运行解密语句
  ast.program.body = decrypt_code
  const { code: decryptExec } = generator(ast, { compact: true })
  virtualGlobalEval(decryptExec)

  // 留下主体代码继续处理
  const content_code = ast.program.body = ast.program.body = [] // 清空以防误并入
  // 重新从原 AST 里取剩余主体
  const rest = ast.program.body = [] // 占位，避免意外副作用
  // 实际主体来自最初切下的：原始 AST 的第 3 条以后
  // 这里重新 parse 一下更稳妥：从头构建一个只含“剩余语句”的 Program
  // 但我们有现成节点，直接复用即可：
  ast.program.body = [] // 先清空
  const remaining = decrypt_code.length // = 3
  // 注意：原来 ast.program.body 已被替换为 decrypt_code，这里我们无法直接 slice；
  // 因此我们让调用方在进入 decodeGlobal 前传入“源代码 parse 出来的 ast”。
  // 为保证稳妥，这里采用一个小技巧：重新解析一次 header + 内容再切分。
  // —— 不过调用方确实传的是完整 ast，这里可直接用临时变量保留原始 nodes。
  // 为简单与健壮，仍沿用最原始的写法：

  // 由于上面我们已改写 ast.program.body，此处需要外部提供的原始 nodes。
  // 为保持与你原脚本一致，这里换回更简单、可工作的逻辑：
  // —— 在进入 decodeGlobal 之前，传入的是原始 ast，我们先缓存一份：
  // 解决方案：函数最开始就复制一份原始 body
  // （为不改你其它逻辑，这里直接在本函数重新解析生成一个副本 body）
  // 重新生成源码再 parse（成本可接受）
  const wholeCodeAgain = generator(ast, { comments: true }).code
  const wholeAstAgain = parse(wholeCodeAgain)
  // 清理空语句
  let j = 0
  while (j < wholeAstAgain.program.body.length) {
    if (t.isEmptyStatement(wholeAstAgain.program.body[j])) {
      wholeAstAgain.program.body.splice(j, 1)
    } else {
      ++j
    }
  }
  const contentNodes = wholeAstAgain.program.body.slice(3)
  ast.program.body = contentNodes

  // 遍历主体：把调用解密函数的地方求值还原
  function funToStr(path) {
    const node = path.node
    if (!t.isIdentifier(node.callee, { name: decrypt_val })) return
    const tmp = path.toString()
    const value = virtualGlobalEval(tmp)
    path.replaceWith(t.valueToNode(value))
  }
  function memToStr(path) {
    const node = path.node
    if (!t.isIdentifier(node.object, { name: decrypt_val })) return
    const tmp = path.toString()
    const value = virtualGlobalEval(tmp)
    path.replaceWith(t.valueToNode(value))
  }
  traverse(ast, {
    CallExpression: funToStr,
    MemberExpression: memToStr,
  })

  return { ast, header: headerText }
}

/* -------------------- 扁平控制流清理 -------------------- */
function cleanSwitchCode(path) {
  const node = path.node
  if (!(t.isBooleanLiteral(node.test) || t.isUnaryExpression(node.test))) return
  if (!(node.test.prefix || node.test.value)) return
  if (!t.isBlockStatement(node.body)) return

  const body = node.body.body
  if (
    !t.isSwitchStatement(body[0]) ||
    !t.isMemberExpression(body[0].discriminant) ||
    !t.isBreakStatement(body[1])
  ) return

  const swithStm = body[0]
  const arrName = swithStm.discriminant.object.name
  const argName = swithStm.discriminant.property.argument.name
  console.log(`扁平化还原: ${arrName}[${argName}]`)

  let arr = []
  path.getAllPrevSiblings().forEach((pre_path) => {
    const { declarations } = pre_path.node
    let { id, init } = declarations[0]
    if (arrName == id.name) {
      arr = init.callee.object.value.split('|')
      pre_path.remove()
    }
    if (argName == id.name) {
      pre_path.remove()
    }
  })

  const caseList = swithStm.cases
  let resultBody = []
  arr.map((targetIdx) => {
    let valid = true
    targetIdx = parseInt(targetIdx)
    while (valid && targetIdx < caseList.length) {
      const targetBody = caseList[targetIdx].consequent
      const test = caseList[targetIdx].test
      if (!t.isStringLiteral(test) || parseInt(test.value) !== targetIdx) {
        console.log(`switch中出现乱序的序号: ${test.value}:${targetIdx}`)
      }
      for (let i = 0; i < targetBody.length; ++i) {
        const s = targetBody[i]
        if (t.isContinueStatement(s)) { valid = false; break }
        if (t.isReturnStatement(s)) { valid = false; resultBody.push(s); break }
        if (t.isBreakStatement(s)) {
          console.log(`switch中出现意外的break: ${arrName}[${argName}]`)
        } else {
          resultBody.push(s)
        }
      }
      targetIdx++
    }
  })
  path.replaceInline(resultBody)
}

/* -------------------- 死代码/常量/序列表达式 清理 -------------------- */
function cleanDeadCode(ast) {
  traverse(ast, calculateConstantExp)
  traverse(ast, pruneIfBranch)
  traverse(ast, { WhileStatement: { exit: cleanSwitchCode } })
  return ast
}

function checkPattern(code, pattern) {
  let i = 0, j = 0
  while (i < code.length && j < pattern.length) {
    if (code[i] == pattern[j]) ++j
    ++i
  }
  return j == pattern.length
}

/* -------------------- 自卫/调试/控制台输出/版本号 处理 -------------------- */
const deleteSelfDefendingCode = {
  VariableDeclarator(path) {
    const { id, init } = path.node
    const selfName = id.name
    if (!t.isCallExpression(init)) return
    if (!t.isIdentifier(init.callee)) return
    const callName = init.callee.name
    const args = init.arguments
    if (args.length != 2 || !t.isThisExpression(args[0]) || !t.isFunctionExpression(args[1])) return
    const block = generator(args[1]).code
    const pattern = `RegExp()return.test(.toString())RegExp()return.test(.toString())\u0435\u0435`
    if (!checkPattern(block, pattern)) return

    const refs = path.scope.bindings[selfName].referencePaths
    for (let ref of refs) {
      if (ref.key == 'callee') { ref.parentPath.remove(); break }
    }
    path.remove()
    console.info(`Remove SelfDefendingFunc: ${selfName}`)
    const scope = path.scope.getBinding(callName).scope
    scope.crawl()
    const bind = scope.bindings[callName]
    if (bind.referenced) { console.error(`Call func ${callName} unexpected ref!`) }
    bind.path.remove()
    console.info(`Remove CallFunc: ${callName}`)
  },
}

const deleteDebugProtectionCode = {
  FunctionDeclaration(path) {
    const { id, params, body } = path.node
    if (
      !t.isIdentifier(id) ||
      params.length !== 1 ||
      !t.isIdentifier(params[0]) ||
      !t.isBlockStatement(body) ||
      body.body.length !== 2 ||
      !t.isFunctionDeclaration(body.body[0]) ||
      !t.isTryStatement(body.body[1])
    ) return

    const debugName = id.name
    const ret = params[0].name
    const subNode = body.body[0]
    if (!t.isIdentifier(subNode.id) || subNode.params.length !== 1 || !t.isIdentifier(subNode.params[0])) return
    const subName = subNode.id.name
    const counter = subNode.params[0].name
    const code = generator(body).code
    const pattern = `function${subName}(${counter}){${counter}debug${subName}(++${counter})}try{if(${ret})return${subName}${subName}(0)}catch(){}`
    if (!checkPattern(code, pattern)) return

    const scope1 = path.parentPath.scope
    const refs = scope1.bindings[debugName].referencePaths
    for (let ref of refs) {
      if (ref.findParent((p) => p.removed)) continue
      let parent = ref.getFunctionParent()
      if (parent.key == 0) {
        parent.parentPath.remove()
        continue
      }
      const callName = parent.parent.callee.name
      const up2 = parent.getFunctionParent().parentPath
      const scope2 = up2.scope.getBinding(callName).scope
      up2.remove()
      scope1.crawl()
      scope2.crawl()
      const bind = scope2.bindings[callName]
      bind.path.remove()
      console.info(`Remove CallFunc: ${callName}`)
    }
    path.remove()
    console.info(`Remove DebugProtectionFunc: ${debugName}`)
  },
}

const deleteConsoleOutputCode = {
  VariableDeclarator(path) {
    const { id, init } = path.node
    const selfName = id.name
    if (!t.isCallExpression(init)) return
    if (!t.isIdentifier(init.callee)) return
    const callName = init.callee.name
    const args = init.arguments
    if (args.length != 2 || !t.isThisExpression(args[0]) || !t.isFunctionExpression(args[1])) return

    const body = args[1].body.body
    if (body.length !== 3) return
    if (!t.isVariableDeclaration(body[0]) || !t.isVariableDeclaration(body[1]) || !t.isIfStatement(body[2])) return

    const feature = [
      [],
      ['window', 'process', 'require', 'global'],
      ['console','log','warn','debug','info','error','exception','trace'],
    ]
    let valid = true
    for (let i = 1; i < 3; ++i) {
      const { code } = generator(body[i])
      feature[i].map((key) => { if (code.indexOf(key) == -1) valid = false })
    }
    if (!valid) return

    const refs = path.scope.bindings[selfName].referencePaths
    for (let ref of refs) {
      if (ref.key == 'callee') { ref.parentPath.remove(); break }
    }
    path.remove()
    console.info(`Remove ConsoleOutputFunc: ${selfName}`)
    const scope = path.scope.getBinding(callName).scope
    scope.crawl()
    const bind = scope.bindings[callName]
    if (bind.referenced) { console.error(`Call func ${callName} unexpected ref!`) }
    bind.path.remove()
    console.info(`Remove CallFunc: ${callName}`)
  },
}

const deleteVersionCheck = {
  StringLiteral(path) {
    const msg = '删除版本号，js会定期弹窗，还请支持我们的工作'
    if (path.node.value !== msg) return
    let fnPath = path.getFunctionParent().parentPath
    if (!fnPath.isCallExpression()) return
    fnPath.remove()
    console.log('Remove VersionCheck')
  },
}

/* -------------------- 环境限制解除 -------------------- */
function unlockEnv(ast) {
  traverse(ast, deleteSelfDefendingCode)
  traverse(ast, deleteDebugProtectionCode)
  traverse(ast, deleteConsoleOutputCode)
  traverse(ast, deleteVersionCheck)
  return ast
}

/* -------------------- 净化与格式修复 -------------------- */
function purifyFunction(path) {
  const node = path.node
  if (!t.isIdentifier(node.left) || !t.isFunctionExpression(node.right)) return
  const name = node.left.name
  if (node.right.body.body.length !== 1) return
  let retStmt = node.right.body.body[0]
  if (!t.isReturnStatement(retStmt)) return
  if (!t.isBinaryExpression(retStmt.argument, { operator: '+' })) return
  try {
    const fnPath = path.getFunctionParent() || path.scope.path
    fnPath.traverse({
      CallExpression: function (_path) {
        const _node = _path.node.callee
        if (!t.isIdentifier(_node, { name })) return
        let args = _path.node.arguments
        _path.replaceWith(t.binaryExpression('+', args[0], args[1]))
      },
    })
    path.remove()
    console.log(`拼接类函数: ${name}`)
  } catch {
    let code = generator(path.node, { minified: true }).code
    console.warn('Purify function failed: ' + code)
  }
}

function purifyCode(ast) {
  traverse(ast, { AssignmentExpression: purifyFunction })
  traverse(ast, calculateConstantExp)
  function FormatMember(path) {
    let curNode = path.node
    if (!t.isStringLiteral(curNode.property)) return
    if (curNode.computed === undefined || !curNode.computed === true) return
    if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(curNode.property.value)) return
    curNode.property = t.identifier(curNode.property.value)
    curNode.computed = false
  }
  traverse(ast, { MemberExpression: FormatMember })
  traverse(ast, splitSequence)
  traverse(ast, { EmptyStatement: (path) => path.remove() })
  traverse(ast, deleteUnusedVar)
  return ast
}

/* -------------------- 主入口：保留 header 并拼回 -------------------- */
export default function (code) {
  // 先尝试 eval 解包
  let ret = PluginEval.unpack(code)
  let global_eval = false
  if (ret) { global_eval = true; code = ret }

  // 初次 parse
  let ast = parse(code)

  // 清理数值/字符串节点中的 extra（避免 \x / \u 再编码）
  traverse(ast, { StringLiteral: ({ node }) => { delete node.extra } })
  traverse(ast, { NumericLiteral: ({ node }) => { delete node.extra } })

  console.log('处理全局加密...')
  const dg = decodeGlobal(ast)
  if (!dg || !dg.ast) {
    return null
  }
  ast = dg.ast
  const header = dg.header || ''

  console.log('处理代码块加密...')
  traverse(ast, parseControlFlowStorage)

  console.log('清理死代码...')
  ast = cleanDeadCode(ast)

  // 刷新代码（一次生成 → 再 parse，稳定结构）
  ast = parse(
    generator(ast, {
      comments: false,
      jsescOption: { minimal: true },
    }).code
  )

  console.log('提高代码可读性...')
  ast = purifyCode(ast)

  console.log('解除环境限制...')
  ast = unlockEnv(ast)

  console.log('净化完成')

  // 最终生成
  let out = generator(ast, {
    comments: false,
    jsescOption: { minimal: true },
  }).code

  // 把“开头三句”以注释形式拼回（不改变执行逻辑）
  const headerComment =
    header
      ? `/* ==== ORIGINAL HEADER (kept) ==== \n${header}\n==== END HEADER ==== */\n`
      : ''
  out = headerComment + out

  // 如果最开始通过 eval 解包过，则重新 pack 回去（保持你原先流程）
  if (global_eval) {
    out = PluginEval.pack(out)
  }
  return out
}