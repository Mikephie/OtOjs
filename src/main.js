// src/main.js —— 稳定链式版（支持可选编码库预处理）

import fs from 'fs';
import process from 'process';

// ---------------------- 可选：编码库预处理（存在则自动启用） ----------------------
let runExtraCodecs = null;
try {
  const extra = await import('./plugin/extra-codecs/index.js'); // 若无该文件会被 catch
  runExtraCodecs = (extra.default || extra.runExtraCodecs || null);
} catch (_) {
  // 忽略：未提供编码库也能正常运行
}

// ---------------------- 动态加载原有插件 ----------------------
const commonModule      = await import('./plugin/common.js');
const jjencodeModule    = await import('./plugin/jjencode.js');
const sojsonModule      = await import('./plugin/sojson.js');
const sojsonv7Module    = await import('./plugin/sojsonv7.js');
const obfuscatorModule  = await import('./plugin/obfuscator.js');
const awscModule        = await import('./plugin/awsc.js');
const jsconfuserModule  = await import('./plugin/jsconfuser.js');

// 兼容 default / 命名导出
const PluginCommon     = commonModule.default     ?? commonModule;
const PluginJjencode   = jjencodeModule.default   ?? jjencodeModule;
const PluginSojson     = sojsonModule.default     ?? sojsonModule;
const PluginSojsonV7   = sojsonv7Module.default   ?? sojsonv7Module;
const PluginObfuscator = obfuscatorModule.default ?? obfuscatorModule;
const PluginAwsc       = awscModule.default       ?? awscModule;
const PluginJsconfuser = jsconfuserModule.default ?? jsconfuserModule;

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

// 工具：统一处理插件返回（string 或 {code}）
const getCode = (ret) => {
  if (!ret) return '';
  if (typeof ret === 'string') return ret;
  if (typeof ret === 'object' && typeof ret.code === 'string') return ret.code;
  return '';
};

// 早停的哨兵关键字检查：对“当前代码”判断
const shouldEarlyStop = (code) => code.includes('smEcV');

// ---------------------- 0) 可选：编码库预处理 ----------------------
if (runExtraCodecs) {
  try {
    const before = processedCode;
    const ret = await runExtraCodecs(processedCode, { notes });
    const after = getCode(ret) || ret || processedCode;
    if (after !== before) {
      processedCode = after;
      pluginUsed = 'extra-codecs';
      console.log('预处理（编码库）已替换部分字符串/解码调用');
    }
  } catch (e) {
    console.error(`编码库预处理失败: ${e.message}`);
  }
}

// ---------------------- 1) 原有插件（链式，命中即早停） ----------------------
const plugins = [
  { name: 'obfuscator', plugin: PluginObfuscator },
  { name: 'sojsonv7',   plugin: PluginSojsonV7 },
  { name: 'sojson',     plugin: PluginSojson },
  { name: 'jsconfuser', plugin: PluginJsconfuser },
  { name: 'awsc',       plugin: PluginAwsc },
  { name: 'jjencode',   plugin: PluginJjencode },
  { name: 'common',     plugin: PluginCommon }, // 最后兜底
];

if (!shouldEarlyStop(processedCode)) {
  for (const { name, plugin } of plugins) {
    try {
      const before = processedCode;
      const ret = await plugin(before);         // 统一 await，兼容异步插件
      const after = getCode(ret) || ret || before;

      if (after !== before) {
        processedCode = after;
        pluginUsed = name;
        console.log(`命中插件：${name}`);
        break;                                  // 有变化就早停
      }
    } catch (error) {
      console.error(`插件 ${name} 处理时发生错误: ${error.message}`);
    }
  }
} else {
  console.log('命中早停哨兵（smEcV），跳过插件链。');
}

// ---------------------- 2) 写出结果（同步写，避免 CI 早退） ----------------------
if (processedCode !== sourceCode) {
  fs.mkdirSync(decodeFile.substring(0, decodeFile.lastIndexOf('/')) || '.', { recursive: true });
  const outputCode = processedCode;
  fs.writeFileSync(decodeFile, outputCode, 'utf-8');   // 同步写
  console.log(`使用插件 ${pluginUsed || 'extra-codecs/unknown'} 成功处理并写入文件 ${decodeFile}`);
  if (notes.length) console.log('Notes:', notes.join(' | '));
} else {
  console.log('所有插件处理后的代码与原代码一致，未写入文件。');
}
