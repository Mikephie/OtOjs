// src/plugin/extra-codecs/second-pass.js
// 目标：对第一次输出进行“无副作用”的二次清理（修正布尔位、修复正则拼写、去除jsjiami水印与无用哨兵IIFE），不尝试复杂解码。
// 用法：node src/plugin/extra-codecs/second-pass.js output/output.js output/output.deob2.js

import fs from "fs";
import path from "path";

function readText(p) {
  return fs.readFileSync(p, "utf8");
}
function writeText(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, "utf8");
}

// 规范化空白，便于跨行匹配
function squash(ws) {
  return ws.replace(/\r\n?/g, "\n");
}

// 将所有布尔位强制到目标状态（不管第一次已经替成什么）
function forceBooleanFlags(s) {
  const pairs = [
    // 这些是你脚本里想要最终固定为 false 的字段
    [/("isObfuscated":)(?:\s*true|\s*false)/g, '$1false'],
    [/("isNsfw":)(?:\s*true|\s*false)/g, '$1false'],
    [/("isAdPersonalizationAllowed":)(?:\s*true|\s*false)/g, '$1false'],
    [/("isThirdPartyInfoAdPersonalizationAllowed":)(?:\s*true|\s*false)/g, '$1false'],
    [/("isNsfwMediaBlocked":)(?:\s*true|\s*false)/g, '$1false'],
    [/("isNsfwContentShown":)(?:\s*true|\s*false)/g, '$1false'],

    // 这些是你脚本里想要固定为 true 的字段
    [/("isPremiumMember":)(?:\s*true|\s*false)/g, '$1true'],
    [/("isEmployee":)(?:\s*true|\s*false)/g, '$1true'],
  ];
  let out = s;
  for (const [re, rep] of pairs) out = out.replace(re, rep);
  return out;
}

// 修正被误改坏的 obfuscatedPath 正则：统一抹成 null
function fixObfuscatedPath(s) {
  // 任何 "obfuscatedPath":"……" 统一置 null
  return s.replace(/("obfuscatedPath")\s*:\s*"[^"]*"/g, '$1:null');
}

// 去掉 jsjiami 水印变量（安全：仅删除水印字符串，不删解码器）
function stripWatermarks(s) {
  let out = s;
  // var _0xodH = 'jsjiami.com.v7';
  out = out.replace(
    /(?:var|let|const)\s+_0xodH\s*=\s*['"]jsjiami\.com\.v7['"]\s*;?\n?/g,
    ""
  );
  // var version_ = 'jsjiami.com.v7';
  out = out.replace(
    /(?:var|let|const)\s+version_\s*=\s*['"]jsjiami\.com\.v7['"]\s*;?\n?/g,
    ""
  );
  return out;
}

// 去掉 jsjiami 的“空哨兵 IIFE if(...){}”
// 形如： if (function(...) { ... }(0x3340, ..., _0x1715, 0xcf), _0x1715) {}
function stripSentinelIIFE(s) {
  // 为了稳妥，用尽量宽松且不贪婪的跨行正则
  return s.replace(
    /if\s*\(\s*function\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\([^)]*\)\s*,\s*_0x1715\s*\)\s*\{\s*\}\s*;?/g,
    ""
  );
}

// 轻量去噪：把多余的连续空行缩一下
function tidyWhitespace(s) {
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ");
}

function run(inputPath, outputPath) {
  let code = squash(readText(inputPath));
  const before = code;

  // 1) 强制布尔位
  code = forceBooleanFlags(code);
  // 2) 修正 obfuscatedPath
  code = fixObfuscatedPath(code);
  // 3) 去掉水印变量
  code = stripWatermarks(code);
  // 4) 去掉空哨兵 IIFE
  code = stripSentinelIIFE(code);
  // 5) 轻度整理空白
  code = tidyWhitespace(code);

  writeText(outputPath, code);

  const changed = before !== code;
  console.log(
    `[second-pass] ${changed ? "modified" : "no-change"} -> ${outputPath}`
  );
}

const [,, inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error("Usage: node src/plugin/extra-codecs/second-pass.js <in> <out>");
  process.exit(2);
}
run(inFile, outFile);
