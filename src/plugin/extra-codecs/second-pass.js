// src/plugin/extra-codecs/second-pass.js
import fs from 'fs';
import { runExtraCodecsLoop } from './index.js';

if (process.argv.length < 4) {
  console.error("Usage: node second-pass.js <input> <output>");
  process.exit(1);
}

const inputFile = process.argv[2];
const outputFile = process.argv[3];

try {
  const code = fs.readFileSync(inputFile, 'utf8');
  const notes = [];
  const out = runExtraCodecsLoop(code, { notes }, { maxPasses: 5 });
  fs.writeFileSync(outputFile, out, 'utf8');
  console.log(`Second-pass decode finished: ${outputFile}`);
  if (notes.length) console.log(notes.join("\n"));
} catch (err) {
  console.error("Second-pass failed:", err);
  process.exit(1);
}