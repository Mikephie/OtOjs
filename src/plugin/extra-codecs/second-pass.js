// src/plugin/extra-codecs/second-pass.js
import fs from 'fs';
import { runExtraCodecsLoop } from './index.js';

function ensureDir(p) {
  const dir = require('path').dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const [, , inFile, outFile] = process.argv;

  if (!inFile || !outFile) {
    console.error('用法: node src/plugin/extra-codecs/second-pass.js <input.js> <output.js>');
    process.exit(1);
  }

  if (!fs.existsSync(inFile)) {
    console.error(`找不到输入文件: ${inFile}`);
    process.exit(1);
  }

  const notes = [];
  const code = fs.readFileSync(inFile, 'utf8');
  const processed = runExtraCodecsLoop(code, { notes }, { maxPasses: 3 });

  if (processed === code) {
    console.log('二次解密：无变化，输出相同。');
    if (notes.length) console.log('Notes:', notes.join(' | '));
    fs.writeFileSync(outFile, code, 'utf8');
    return;
  }

  ensureDir(outFile);
  fs.writeFileSync(outFile, processed, 'utf8');
  console.log(`二次解密完成，已写出: ${outFile}`);
  if (notes.length) console.log('Notes:', notes.join(' | '));
}

main();