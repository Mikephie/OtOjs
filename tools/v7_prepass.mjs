#!/usr/bin/env node
// tools/v7_prepass.mjs
// Node 无依赖版：提取 jsjiami/sojson v7 的 factory+mapper，构造字符串映射并替换调用。
// 用法：node tools/v7_prepass.mjs -i input.js -o input.pre.js

import fs from "node:fs/promises";

function parseArgs() {
  const a = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "-i") out.in = a[++i];
    else if (a[i] === "-o") out.out = a[++i];
  }
  if (!out.in || !out.out) {
    console.error("Usage: node tools/v7_prepass.mjs -i <input.js> -o <output.js>");
    process.exit(2);
  }
  return out;
}

function stripComments(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*\n/g, '$1\n');
}
function looksLikeV7(code){
  if (/jsjiami\.com\.v7|sojson\.v7/i.test(code)) return true;
  if (/_0x[0-9a-fA-F]{3,}\(\s*0x[0-9a-fA-F]+,\s*['"][^'"]+['"]\s*\)/.test(code) &&
      /function\s+_0x[0-9a-fA-F]{3,}\s*\([^)]+\)\s*\{/.test(code)) return true;
  return false;
}
function extractPieces(code){
  const factoryRe = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\)\s*\{[\s\S]*?\breturn\b[\s\S]*?\};?/m;
  const mapperRe  = /function\s+(_0x[0-9a-fA-F]{3,})\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*\)\s*\{[\s\S]*?\}/m;
  const f = factoryRe.exec(code);
  const m = mapperRe.exec(code);
  if (!f || !m) return null;
  return {
    factoryName: f[1],
    factorySrc: f[0],
    mapperName:  m[1],
    mapperArg1:  m[2],
    mapperArg2:  m[3],
    mapperSrc:   m[0],
  };
}
function buildSandbox(pieces){
  const prelude = `
    var window={},globalThis=globalThis||{},self={};
    var document={},navigator={},location={href:""};
    var console={log(){},warn(){},error(){}};
    var setTimeout=function(){},setInterval=function(){},clearTimeout=function(){},clearInterval=function(){};
    var $done=function(){},$response={},$request={};
    var atob = (function(){var b64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';return function(input){
      var str=String(input).replace(/=+$/,'');if(str.length%4===1)throw new Error('bad b64');var output='';
      var bc=0,bs,buffer,idx=0;for(;buffer=str.charAt(idx++);~buffer&&(bs=bc%4?bs*64+buffer:buffer,bc++%4)?output+=String.fromCharCode(255&bs>>(-2*bc&6)):0){buffer=b64.indexOf(buffer);}return output;
    };})();
  `;
  const source = prelude + "\n" + pieces.factorySrc + "\n" + pieces.mapperSrc + "\n" +
    `return { factory:${pieces.factoryName}, mapfn:${pieces.mapperName} };`;
  try {
    const fn = new Function(source);
    const res = fn();
    if (!res || typeof res.factory!=="function" || typeof res.mapfn!=="function") return null;
    return res;
  } catch (e) {
    return null;
  }
}
function replaceCalls(code, pieces, mapfn){
  const callRe = new RegExp(pieces.mapperName.replace(/\$/g,"\\$") + String.raw`\(\s*(0x[0-9a-fA-F]+)\s*,\s*['"]([^'"]+)['"]\s*\)`, "g");
  const seen = new Map();
  let m;
  while ((m = callRe.exec(code))) {
    const idxHex = m[1], key = m[2];
    const k = idxHex+"::"+key;
    if (!seen.has(k)) {
      let val;
      try { val = mapfn(Number(idxHex), key); } catch(e){ val = null; }
      if (typeof val !== "string") val = null;
      seen.set(k, val);
    }
  }
  let out = code;
  for (const [k, val] of seen.entries()) {
    const [idxHex, key] = k.split("::");
    const lit = (val!==null) ? JSON.stringify(val) : `/*v7_unresolved(${idxHex},${JSON.stringify(key)})*/`;
    const one = new RegExp(pieces.mapperName.replace(/\$/g,"\\$") + String.raw`\(\s*` +
                           idxHex + String.raw`\s*,\s*['"]` +
                           key.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&') + String.raw`['"]\s*\)`, "g");
    out = out.replace(one, lit);
  }
  return out;
}

async function main(){
  const { in:inPath, out:outPath } = parseArgs();
  let code = await fs.readFile(inPath, "utf8");
  const codeStripped = stripComments(code);
  if (!looksLikeV7(codeStripped)) {
    // 非 v7，原样输出
    await fs.writeFile(outPath, code, "utf8");
    console.log("[v7-prepass] not v7, passthrough");
    return;
  }
  const pieces = extractPieces(codeStripped);
  if (!pieces) {
    await fs.writeFile(outPath, code, "utf8");
    console.log("[v7-prepass] pieces not found, passthrough");
    return;
  }
  const sandbox = buildSandbox(pieces);
  if (!sandbox) {
    await fs.writeFile(outPath, code, "utf8");
    console.log("[v7-prepass] sandbox build fail, passthrough");
    return;
  }
  const replaced = replaceCalls(code, pieces, sandbox.mapfn);
  await fs.writeFile(outPath, replaced, "utf8");
  console.log("[v7-prepass] replaced mapped string calls");
}

main().catch(e=>{ console.error(e); process.exit(1); });
