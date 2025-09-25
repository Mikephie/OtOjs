// src/plugin/extra-codecs/second-pass.js
import fs from 'fs';
import path from 'path';
import { runExtraCodecsLoop } from './index.js';

const [,, inFile, outFile] = process.argv;

if (!inFile || !outFile) {
  console.error('Usage: node src/plugin/extra-codecs/second-pass.js <input> <output>');
  process.exit(2);
}

if (!fs.existsSync(inFile)) {
  console.error(`[second-pass] input not found: ${inFile}`);
  process.exit(3);
}

const input = fs.readFileSync(inFile, 'utf-8');
const notes = [];
const result = runExtraCodecsLoop(input, { notes }, { maxPasses: 3 });

if (result !== input) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, result, 'utf-8');
  console.log(`[second-pass] wrote: ${outFile}`);
} else {
  console.log('[second-pass] no change, skipped writing');
}

if (notes.length) console.log('Notes:', notes.join(' | '));