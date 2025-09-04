#!/usr/bin/env node
// tools/v7_prepass.mjs (v4)
import fs from "node:fs/promises";
const DEBUG = process.env.PREPASS_DEBUG === "1";

function args(){const a=process.argv.slice(2),r={};for(let i=0;i<a.length;i++){if(a[i]==="-i")r.i=a[++i];else if(a[i]==="-o")r.o=a[++i];}if(!r.i||!r.o){console.error("Usage: node tools/v7_prepass.mjs -i <input.js> -o <output.js>");process.exit(2);}return r;}
const strip = s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^\S\r\n])\/\/[^\n]*\n/g,'$1\n');
function looksLikeV7(code){return /jsjiami\.com\.v7|sojson\.v7/i.test(code)||(/_0x[0-9a-fA-F]{3,}\(\s*0x[0-9a-fA-F]+\s*,\s*['"][^'"]+['"]\s*\)/.test(code)&&/function\s+_0x[0-9a-fA-F]{3,}\s*\(\)\s*\{[\s\S]*?\breturn\b/.test(code));}
function findPreamble(src){let start=-1;const s1=src.indexOf("var _0xodH"),s2=src.indexOf("const version");start=(s1>=0&&s2>=0)?Math.min(s1,s2):Math.max(s1,s2);if(start<0)return null;const ends=[src.indexOf("let body"),src.indexOf("const opName"),src.indexOf("try {")].filter(x=>x>=0);if(!ends.length)return null;const end=Math.min(...ends);if(end<=start)return null;return{start,end,preamble:src.slice(start,end)};}
function detectMapperName(source){const m=/const\s+[_$a-zA-Z0-9]+\s*=\s*(_0x[0-9a-fA-F]{3,})\s*;/.exec(source);return m?m[1]:null;}
function buildSandboxAndEval(preamble){
  const prelude=`(function(){var __g=(typeof globalThis!=='undefined')?globalThis:(typeof global!=='undefined')?global:(typeof window!=='undefined')?window:(typeof self!=='undefined')?self:{};var window=__g.window||{};var self=__g.self||{};var document=__g.document||{};var navigator=__g.navigator||{};var location=__g.location||{href:""};var console=__g.console||{log(){},warn(){},error(){}};var setTimeout=__g.setTimeout||function(){};var setInterval=__g.setInterval||function(){};var clearTimeout=__g.clearTimeout||function(){};var clearInterval=__g.clearInterval||function(){};var $done=function(){};var $response={body:""};var $request={};var _0xodH='jsjiami.com.v7';var version='V1.0.9';var atob=(function(){var b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';return function(i){var s=String(i).replace(/=+$/,'');if(s.length%4===1)throw new Error('bad b64');var o='',bc=0,bs,B,idx=0;for(;B=s.charAt(idx++);~B&&(bs=bc%4?bs*64+B:B,bc++%4)?o+=String.fromCharCode(255&bs>>(-2*bc&6)):0){B=b.indexOf(B);}return o;};})();var __exports={};`;
  const tail=`__exports;})()`;
  const src=`return ${prelude}\n${preamble}\n${tail};`;
  try{const fn=new Function(src);return fn()||{};}catch(e){if(DEBUG)console.error("[v7-prepass] sandbox error:",e&&(e.stack||e.message||e));return null;}
}
function replaceCalls(full, name, mapfn){
  const callRe=new RegExp(name.replace(/\$/g,"\\$")+String.raw`$begin:math:text$\\s*(0x[0-9a-fA-F]+)\\s*,\\s*['"]([^'"]+)['"]\\s*$end:math:text$`,"g");
  const seen=new Map();let m;while((m=callRe.exec(full))){const idx=m[1],key=m[2],tk=idx+"::"+key;if(!seen.has(tk)){let v=null;try{v=mapfn(Number(idx),key);}catch(_){}if(typeof v!=="string")v=null;seen.set(tk,v);}}
  let out=full;for(const [tk,v] of seen.entries()){const [idx,key]=tk.split("::");const lit=(v!==null)?JSON.stringify(v):`/*v7_unresolved(${idx},${JSON.stringify(key)})*/`;const one=new RegExp(name.replace(/\$/g,"\\$")+String.raw`\(\s*`+idx+String.raw`\s*,\s*['"]`+key.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&')+String.raw`['"]\s*\)`,"g");out=out.replace(one,lit);}return out;
}
async function main(){
  const {i:oIn,o:oOut}=args();const raw=await fs.readFile(oIn,"utf8");const stripped=strip(raw);
  if(!looksLikeV7(stripped)){await fs.writeFile(oOut,raw,"utf8");console.log("[v7-prepass] passthrough (not v7)");return;}
  const pre=findPreamble(stripped); if(!pre){await fs.writeFile(oOut,raw,"utf8");console.log("[v7-prepass] preamble not found (passthrough)");return;}
  const mapper=detectMapperName(stripped)||"_0x1e61";
  const box=buildSandboxAndEval(pre.preamble); if(!box){await fs.writeFile(oOut,raw,"utf8");console.log("[v7-prepass] sandbox failed (passthrough)");return;}
  let mapfn=null; try{const getter=new Function(`${pre.preamble}\n;return (typeof ${mapper}==='function')?${mapper}:null;`); mapfn=getter();}catch(e){if(DEBUG)console.error("[v7-prepass] mapper getter error:",e&&e.message);}
  if(typeof mapfn!=="function"){await fs.writeFile(oOut,raw,"utf8");console.log("[v7-prepass] mapper not resolved (passthrough)");return;}
  const out=replaceCalls(raw,mapper,mapfn); await fs.writeFile(oOut,out,"utf8"); console.log("[v7-prepass] replaced mapped string calls");
}
main().catch(e=>{console.error(e);process.exit(1);});