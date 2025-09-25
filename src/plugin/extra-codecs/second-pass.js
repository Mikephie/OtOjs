// second-pass.js —— 对第一次解密的结果再跑一轮 extra-codecs

import fs from 'fs';
import { runExtraCodecsLoop } from './src/plugin/extra-codecs/index.js';

const infile = process.argv[2] || 'output/output.js';
const outfile = process.argv[3] || 'output/output.deob2.js';

if (!fs.existsSync(infile)) {
  console.error(`输入文件不存在: ${infile}`);
  process.exit(1);
}

const code = fs.readFileSync(infile, 'utf-8');
const notes = [];
const out = runExtraCodecsLoop(code, { notes });

if (out && out !== code) {
  fs.writeFileSync(outfile, out, 'utf-8');
  console.log(`二次解密完成，写入: ${outfile}`);
  if (notes.length) console.log('Notes:', notes.join(' | '));
} else {
  console.log('二次解密没有变化。');
}