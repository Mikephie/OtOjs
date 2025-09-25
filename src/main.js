// src/main.js —— 稳定链式版（主插件后再跑 extra-codecs 二次处理）

import fs from 'fs';
import process from 'process';

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

// ---------------------- 可选：编码库（存在才加载） ----------------------
let runExtraCodecs = null;
try {
  const extra = await import('./plugin/extra-codecs/index.js');
  runExtraCodecs = extra.runExtraCodecs || extra.default || null;
} catch { /* 无编码库亦可运行 */ }

// ---------------------- CLI 参数 ----------------------
let encodeFile = 'input.js';
let decodeFile = 'output.js';
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

// 工具：把插件可能返回的 {code} / string 统一成字符串
const getCode = (ret, fallback) => {
  if (typeof ret === 'string') return ret;
  if (ret && typeof ret.code === 'string') return ret.code;
  return fallback;
};

// 哨兵：命中就早停主插件（你原本逻辑）
const shouldEarlyStop = (code) => code.includes('smEcV');

// ---------------------- 1) 主插件链（命中即早停） ----------------------
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
      const ret = await plugin(before);
      const after = getCode(ret) || ret || before;

      if (after !== before) {
        processedCode = after;
        pluginUsed = name;
        console.log(`命中插件：${name}`);
        break;
      }
    } catch (error) {
      console.error(`插件 ${name} 处理时发生错误: ${error.message}`);
    }
  }
} else {
  console.log('命中早停哨兵（smEcV），跳过插件链。');
}

// ---------------------- 1.5) 主链之后，强制跑 RC4 多轮收敛 ----------------------
try {
  const { runExtraCodecsLoop } = await import('./plugin/extra-codecs/index.js');
  const before = processedCode;
  const after = runExtraCodecsLoop(before, { notes }, { maxPasses: 3 });
  if (typeof after === 'string' && after !== before) {
    processedCode = after;
    if (!pluginUsed) pluginUsed = 'extra-codecs';
    notes.push('extra-codecs: rc4 loop applied');
  }
} catch (e) {
  notes.push(`extra-codecs loop error: ${e.message}`);
}

// ---------------------- 2) 写出结果 二次预处理（主插件之后跑 extra-codecs） ----------------------
if (runExtraCodecs) {
  try {
    const before = processedCode;
    const ret = await runExtraCodecs(before, { notes });
    const after = getCode(ret, before);
    if (after !== before) {
      processedCode = after;
      console.log('二次预处理：extra-codecs 生效');
    }
  } catch (e) {
    notes.push(`extra-codecs failed: ${e.message}`);
  }
}

// ---------------------- 3) 写出结果（同步写，避免 CI 早退） ----------------------
if (processedCode !== sourceCode) {
  const time = new Date();
  const header = [
    `//${time}`,
    '//Base:<url id="cv1cref6o68qmpt26ol0" type="url" status="parsed" title="GitHub - echo094/decode-js: JS混淆代码的AST分析工具 AST analysis tool for obfuscated JS code" wc="2165">https://github.com/echo094/decode-js</url>',
    '//Modify:<url id="cv1cref6o68qmpt26olg" type="url" status="parsed" title="GitHub - smallfawn/decode_action: 世界上本来不存在加密，加密的人多了，也便成就了解密" wc="741">https://github.com/smallfawn/decode_action</url>',
  ].join('\n');

  fs.writeFileSync(decodeFile, `${header}\n${processedCode}`, 'utf-8');
  console.log(`使用插件 ${pluginUsed || 'extra-codecs/unknown'} 成功处理并写入文件 ${decodeFile}`);
  if (notes.length) console.log('Notes:', notes.join(' | '));
} else {
  console.log('所有插件处理后的代码与原代码一致，未写入文件。');
}