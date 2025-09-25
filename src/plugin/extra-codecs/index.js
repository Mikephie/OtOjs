// src/plugin/extra-codecs/second-pass.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runExtraCodecs } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [, , inFile, outFile] = process.argv;

if (!inFile || !outFile) {
  console.error('Usage: node second-pass.js <inputFile> <outputFile>');
  process.exit(1);
}

const inputPath = path.resolve(__dirname, '../../..', inFile);   // 兼容从仓库根目录执行
const outputPath = path.resolve(__dirname, '../../..', outFile);

const src = fs.readFileSync(inputPath, 'utf8');

const notes = [];
const out = runExtraCodecs(src, { notes });

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, out, 'utf8');

if (notes.length) {
  console.log('Notes:', notes.join(' | '));
}
console.log(`Second pass wrote: ${outFile}`);