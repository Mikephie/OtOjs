// src/main.js —— 稳定链式版（支持可选编码库预处理）

import fs from 'fs';
import process from 'process';

// ---------------------- 可选：编码库预处理（存在则自动启用） ----------------------
let runExtraCodecs = null;
try {
  const extra = await import('./plugin/extra-codecs/index.js');
  runExtraCodecs = extra.runExtraCodecsLoop || extra.runExtraCodecs || extra.default || null;
} catch (_) {
  // 忽略：没有也能运行
}

// ---------------------- 动态加载插件 ----------------------
const modules = {
  common: await import('./plugin/common.js'),
  jjencode: await import('./plugin/jjencode.js'),
  sojson: await import('./plugin/sojson.js'),
  sojsonv7: await import('./plugin/sojsonv7.js'),
  obfuscator: await import('./plugin/obfuscator.js'),
  awsc: await import('./plugin/awsc.js'),
  jsconfuser: await import('./plugin/jsconfuser.js')
};
const plugins = Object.entries(modules).map(([name, m]) => ({
  name,
  plugin: m.default ?? m
}));

// ---------------------- CLI 参数 ----------------------
let encodeFile = 'input.js';
let decodeFile = 'output/output.js';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '-i' && process.argv[i + 1]) encodeFile = process.argv[i + 1];
  if (process.argv[i] === '-o' && process.argv[i + 1]) decodeFile = process.argv[i + 1];
}
console.log(`输入: ${encodeFile}`);
console.log(`输出: ${decodeFile}`);

// ---------------------- 读取源文件 ----------------------
const sourceCode = fs.readFileSync(encodeFile, 'utf-8');
let processedCode = sourceCode;
let pluginUsed = '';
const notes = [];

const getCode = (ret) =>
  typeof ret === 'string' ? ret : (ret && typeof ret.code === 'string' ? ret.code : '');

// ---------------------- 0) 可选预处理 ----------------------
if (runExtraCodecs) {
  try {
    const before = processedCode;
    const ret = await runExtraCodecs(processedCode, { notes });
    const after = getCode(ret) || ret || processedCode;
    if (after !== before) {
      processedCode = after;
      pluginUsed = 'extra-codecs';
      console.log('预处理（编码库）已替换部分内容');
    }
  } catch (e) {
    console.error(`编码库预处理失败: ${e.message}`);
  }
}

// ---------------------- 1) 插件链（命中即停） ----------------------
for (const { name, plugin } of plugins) {
  try {
    const before = processedCode;
    const ret = await plugin(before);
    const after = getCode(ret) || ret || before;
    if (after !== before) {
      processedCode = after;
      pluginUsed = name;
      console.log(`命中插件：${name}`);
      break;
    }
  } catch (e) {
    console.error(`插件 ${name} 处理时错误: ${e.message}`);
  }
}

// ---------------------- 2) 写出结果 ----------------------
if (processedCode !== sourceCode) {
  const time = new Date().toUTCString();
  const header = `//${time}\n//Base:https://github.com/echo094/decode-js\n//Modify:https://github.com/smallfawn/decode_action`;
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync(decodeFile, `${header}\n${processedCode}`, 'utf-8');
  console.log(`使用插件 ${pluginUsed || 'extra-codecs/unknown'} 成功处理并写入 ${decodeFile}`);
  if (notes.length) console.log('Notes:', notes.join(' | '));
} else {
  console.log('所有插件处理后代码与原始相同，未写入文件。');
}