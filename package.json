// src/plugin/extra-codecs/second-pass.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 同时兼容 named / default 两种导出
import runExtraCodecsDefault, { runExtraCodecs as runNamed, runExtraCodecsLoop } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function pickRunner() {
  // 优先用带循环的
  if (typeof runExtraCodecsLoop === 'function') return (code, notes) => runExtraCodecsLoop(code, { notes });
  const fn = typeof runNamed === 'function' ? runNamed : runExtraCodecsDefault;
  return (code, notes) => fn(code, { notes });
}

async function main() {
  const inFile = process.argv[2];
  const outFile = process.argv[3];

  if (!inFile || !outFile) {
    console.error('Usage: node second-pass.js <inputFile> <outputFile>');
    process.exit(2);
  }

  // 读取上一轮输出
  const code = fs.readFileSync(inFile, 'utf-8');
  const notes = [];

  const run = pickRunner();
  const deob = run(code, notes);

  // 确保目录存在
  const outDir = path.dirname(outFile);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(outFile, deob, 'utf-8');

  if (notes.length) {
    console.log('Second-pass notes:', notes.join(' | '));
  }
  console.log(`Second pass saved -> ${outFile}`);
}

main().catch((e) => {
  console.error('Second pass failed:', e?.stack || e?.message || e);
  process.exit(1);
});