// tools/v7_prepass.mjs
// Usage: node tools/v7_prepass.mjs -i input.js -o input.pre.js
import fs from "node:fs/promises";

function args() {
  const a = process.argv.slice(2); const r = {};
  for (let i=0;i<a.length;i++) {
    if (a[i]==="-i") r.i = a[++i];
    else if (a[i]==="-o") r.o = a[++i];
  }
  if (!r.i || !r.o) {
    console.error("Usage: node tools/v7_prepass.mjs -i <input.js> -o <output.js>");
    process.exit(2);
  }
  return r;
}
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|\s)\/\/[^\n]*\n/g,'$1\n');

function looksLikeV7(code){
  if (/jsjiami\.com\.v7|sojson\.v7/i.test(code)) return true;
  if (/_0x[0-9a-fA-F]{3,}\(\s*0x[0-9a-fA-F]+,\s*['"][^'"]+['"]\s*\)/.test(code) &&
      /function\s+_0x[0-9a-fA-F]{3,}\s*\([^)]+\)\s*\{/.test(code)) return true;
  return false;
}
function extractPieces(code){
  const FR=/function\s+(_0x[0-9a-fA-F]{3,})\s*\(\)\s*\{[\s\S]*?\breturn\b[\s\S]*?\};?/m;
  const MR=/function\s+(_0x[0-9a-fA-F]{3,})\s*\(\s*([a-zA-Z0-9_$]+)\s*,\s*([a-zA-Z0-9_$]+)\s*\)\s*\{[\s\S]*?\}/m;
  const f=FR.exec(code), m=MR.exec(code); if(!f||!m) return null;
  return {factoryName:f[1],factorySrc:f[0],mapperName:m[1],mapperSrc:m[0]};
}
function buildSandbox(p){
  const prelude = `
    var window={},globalThis=globalThis||{},self={};
    var document={},navigator={},location={href:""};
    var console={log(){},warn(){},error(){}};
    var setTimeout=function(){},setInterval=function(){},clearTimeout=function(){},clearInterval=function(){};
    var $done=function(){},$response={},$request={};
    var atob=(function(){var b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';return function(i){var s=String(i).replace(/=+$/,'');if(s.length%4===1)throw new Error('bad b64');var o='',bc=0,bs,B,idx=0;for(;B=s.charAt(idx++);~B&&(bs=bc%4?bs*64+B:B,bc++%4)?o+=String.fromCharCode(255&bs>>(-2*bc&6)):0){B=b.indexOf(B);}return o;};})();
  `;
  const src = prelude + "\n" + p.factorySrc + "\n" + p.mapperSrc + "\n" +
    `return {mapfn:${p.mapperName}};`;
  try { const fn = new Function(src); const r = fn(); if(!r||typeof r.mapfn!=="function") return null; return r; }
  catch(e){ return null; }
}
function replaceCalls(code,p,mapfn){
  const callRe = new RegExp(p.mapperName.replace(/\$/g,"\\$")+String.raw`\(\s*(0x[0-9a-fA-F]+)\s*,\s*['"]([^'"]+)['"]\s*\)`, "g");
  const seen=new Map(); let m;
  while ((m=callRe.exec(code))) {
    const idx=m[1], key=m[2], k=idx+"::"+key;
    if (!seen.has(k)) {
      let v=null; try { v=mapfn(Number(idx),key); } catch(_) {}
      if (typeof v!=="string") v=null; seen.set(k,v);
    }
  }
  let out=code;
  for (const [k,v] of seen.entries()) {
    const [idx,key]=k.split("::");
    const lit = v!==null ? JSON.stringify(v) : `/*v7_unresolved(${idx},${JSON.stringify(key)})*/`;
    const one = new RegExp(p.mapperName.replace(/\$/g,"\\$")+String.raw`\(\s*`+idx+String.raw`\s*,\s*['"]`+
                           key.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&')+String.raw`['"]\s*\)`, "g");
    out = out.replace(one, lit);
  }
  return out;
}

async function main(){
  const {i,o}=args();
  const raw = await fs.readFile(i,"utf8");
  const code = strip(raw);
  if (!looksLikeV7(code)) { await fs.writeFile(o, raw, "utf8"); console.log("[v7-prepass] passthrough"); return; }
  const pieces = extractPieces(code);
  if (!pieces) { await fs.writeFile(o, raw, "utf8"); console.log("[v7-prepass] pieces not found"); return; }
  const box = buildSandbox(pieces);
  if (!box) { await fs.writeFile(o, raw, "utf8"); console.log("[v7-prepass] sandbox failed"); return; }
  const out = replaceCalls(raw, pieces, box.mapfn);
  await fs.writeFile(o, out, "utf8");
  console.log("[v7-prepass] replaced mapped string calls");
}
main().catch(e=>{ console.error(e); process.exit(1); });
