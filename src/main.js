// src/main.js
import fs from "node:fs/promises";

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { in: "input.js", out: "output.js" };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "-i") out.in = a[++i];
    else if (a[i] === "-o") out.out = a[++i];
    else if (a[i] === "-t") out.type = a[++i]; // 预留类型
  }
  return out;
}

function cheapFormat(s) {
  // 非严格 formatter：只做基本换行缩进提升可读性；避免引入复杂依赖
  return String(s)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function main() {
  const { in: inFile, out: outFile } = parseArgs();
  const raw = await fs.readFile(inFile, "utf8");
  // 这里本来应该是你的解密/还原流程；先做轻量格式化保证可见输出
  const pretty = cheapFormat(raw);
  await fs.writeFile(outFile, pretty, "utf8");
  console.log(`输入: ${inFile}\n输出: ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});