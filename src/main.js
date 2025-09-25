// src/main.js —— 先主插件，再二次字符串解密（extra-codecs）

import fs from 'fs';
import process from 'process';

// ---------- 动态加载原有插件 ----------
const commonModule      = await import('./plugin/common.js');
const jjencodeModule    = await import('./plugin/jjencode.js');
const sojsonModule      = await import('./plugin/sojson.js');
const sojsonv7Module    = await import('./plugin/sojsonv7.js');
const obfuscatorModule  = await import('./plugin/obfuscator.js');
const awscModule        = await import('./plugin/awsc.js');
const jsconfuserModule  = await import('./plugin/jsconfuser.js');

const PluginCommon     = commonModule.default     ?? commonModule;
const PluginJjencode   = jjencodeModule.default   ?? jjencodeModule;
const PluginSojson     = sojsonModule.default     ?? sojsonModule;
const PluginSojsonV7   = sojsonv7Module.default   ?? sojsonv7Module;
const PluginObfuscator = obfuscatorModule.default ?? obfuscatorModule;
const PluginAwsc       = awscModule.default       ?? awscModule;
const PluginJsconfuser = jsconfuserModule.default ?? jsconfuserModule;

// ---------- 二次处理：编码库（存在才用） ----------
let runExtraCodecs = null;
try {
  const extra = await import('./plugin/extra-codecs/index.js');
  runExtraCodecs = extra.runExtraCodecsLoop ?? extra.runExtraCodecs ?? extra.default ?? null;
} catch { /* 没这个目录也能正常跑 */ }

// ---------- CLI ----------
let encodeFile = 'input.js';
let decodeFile = 'output.js';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '-i' && process.argv[i + 1]) encodeFile = process.argv[i + 1];
  if (process.argv[i] === '-o' && process.argv[i + 1]) decodeFile = process.argv[i + 1];
}
console.log(`输入: ${encodeFile}`);
console.log(`输出: ${decodeFile}`);

// ---------- 读取源 ----------
const sourceCode = fs.readFileSync(encodeFile, 'utf-8');
let processedCode = sourceCode;
let pluginUsed = '';
const notes = [];

// 工具：标准化插件返回
const getCode = (ret) => (typeof ret === 'string') ? ret : (ret && typeof ret.code === 'string' ? ret.code : '');

// ---------- 1) 主插件链（命中即早停） ----------
const plugins = [
  { name: 'obfuscator', plugin: PluginObfuscator },
  { name: 'sojsonv7',   plugin: PluginSojsonV7 },
  { name: 'sojson',     plugin: PluginSojson },
  { name: 'jsconfuser', plugin: PluginJsconfuser },
  { name: 'awsc',       plugin: PluginAwsc },
  { name: 'jjencode',   plugin: PluginJjencode },
  { name: 'common',     plugin: PluginCommon },
];

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
    console.error(`插件 ${name} 处理时发生错误: ${e.message}`);
  }
}

// ---------- 2) 二次字符串解密（对“主插件后的代码”再跑） ----------
if (runExtraCodecs) {
  try {
    const before = processedCode;
    const after = runExtraCodecs(before, { notes }, { maxPasses: 2 });
    if (typeof after === 'string' && after !== before) {
      processedCode = after;
      if (!pluginUsed) pluginUsed = 'extra-codecs';
    }
  } catch (e) {
    notes.push(`extra-codecs error: ${e.message}`);
  }
}

// ---------- 3) 写出 ----------
if (processedCode !== sourceCode) {
  const header = [
    `//${new Date()}`,
    '//Base:<url id="cv1cref6o68qmpt26ol0" type="url" status="parsed" title="GitHub - echo094/decode-js: JS混淆代码的AST分析工具 AST analysis tool for obfuscated JS code" wc="2165">https://github.com/echo094/decode-js</url>',
    '//Modify:<url id="cv1cref6o68qmpt26olg" type="url" status="parsed" title="GitHub - smallfawn/decode_action: 世界上本来不存在加密，加密的人多了，也便成就了解密" wc="741">https://github.com/smallfawn/decode_action</url>',
  ].join('\n');
  fs.writeFileSync(decodeFile, `${header}\n${processedCode}`, 'utf-8');
  console.log(`使用插件 ${pluginUsed || 'extra-codecs'} 成功处理并写入文件 ${decodeFile}`);
  if (notes.length) console.log('Notes:', notes.join(' | '));
} else {
  console.log('所有插件处理后的代码与原代码一致，未写入文件。');
}