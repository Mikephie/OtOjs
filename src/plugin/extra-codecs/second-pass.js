// src/plugin/extra-codecs/second-pass.js
import fs from 'fs';
import path from 'path';
import * as extra from './index.js';

// 兼容 default / 具名导出
const runExtra =
  (extra && (extra.default || extra.runExtraCodecs)) ||
  ((code) => code);

const [, , inFile, outFileCli] = process.argv;
const inputFile = inFile || 'output/output.js';
const outputFile = outFileCli || 'output/output.deob2.js';

const code = fs.readFileSync(inputFile, 'utf-8');
const notes = [];
const out = runExtra(code, { notes });

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, out, 'utf-8');

if (notes.length) console.log('Notes:', notes.join(' | '));
console.log(`Second-pass done → ${outputFile}`);
