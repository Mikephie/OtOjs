// src/main.js —— 稳定链式版（支持 extra-codecs + fold/cleanup/format）

import fs from "fs";
import process from "process";

// ---------------------- 可选：编码库预处理 ----------------------
let runExtraCodecs = null;
try {
  const extra = await import("./plugin/extra-codecs/index.js");
  runExtraCodecs = extra.runExtraCodecs || extra.default || null;
} catch (_) {
  // 没有 extra-codecs 也能正常跑
}

// ---------------------- 动态加载原有插件 ----------------------
const commonModule = await import("./plugin/common.js");
const jjencodeModule = await import("./plugin/jjencode.js");
const sojsonModule = await import("./plugin/sojson.js");
const sojsonv7Module = await import("./plugin/sojsonv7.js");
const obfuscatorModule = await import("./plugin/obfuscator.js");
const awscModule = await import("./plugin/awsc.js");
const jsconfuserModule = await import("./plugin/jsconfuser.js");

const PluginCommon = commonModule.default ?? commonModule;
const PluginJjencode = jjencodeModule.default ?? jjencodeModule;
const PluginSojson = sojsonModule.default ?? sojsonModule;
const PluginSojsonV7 = sojsonv7Module.default ?? sojsonv7Module;
const PluginObfuscator = obfuscatorModule.default ?? obfuscatorModule;
const PluginAwsc = awscModule.default ?? awscModule;
const PluginJsconfuser = jsconfuserModule.default ?? jsconfuserModule;

// ---------------------- 新增后处理插件 ----------------------
const foldModule = await import("./plugin/fold.js");
const cleanupModule = await import("./plugin/cleanup.js");
const formatModule = await import("./plugin/format.js");

const PluginFold = foldModule.default ?? foldModule;
const PluginCleanup = cleanupModule.default ?? cleanupModule;
const PluginFormat = formatModule.default ?? formatModule;

// ---------------------- 输入输出文件 ----------------------
let encodeFile = "input.js";
let decodeFile = "output.js";

for (let i = 2; i < process.argv.length; i += 2) {
  if (process.argv[i] === "-i") encodeFile = process.argv[i + 1];
  else if (process.argv[i] === "-o") decodeFile = process.argv[i + 1];
}

console.log(`输入: ${encodeFile}`);
console.log(`输出: ${decodeFile}`);

// ---------------------- 读源文件 ----------------------
const sourceCode = fs.readFileSync(encodeFile, { encoding: "utf-8" });
let processedCode = sourceCode;
let pluginUsed = "none";
let notes = [];

// ---------------------- 预处理（编码库） ----------------------
if (runExtraCodecs) {
  try {
    const res = runExtraCodecs(processedCode);
    if (res && res !== processedCode) {
      processedCode = res;
      notes.push("预处理（编码库）已替换部分字符串/解码调用");
    }
  } catch (err) {
    notes.push(`[extra-codecs] 运行失败: ${err.message}`);
  }
}

// ---------------------- 主插件链 ----------------------
const plugins = [
  { name: "obfuscator", plugin: PluginObfuscator },
  { name: "sojsonv7", plugin: PluginSojsonV7 },
  { name: "sojson", plugin: PluginSojson },
  { name: "jsconfuser", plugin: PluginJsconfuser },
  { name: "awsc", plugin: PluginAwsc },
  { name: "jjencode", plugin: PluginJjencode },
  { name: "common", plugin: PluginCommon },
  { name: "fold", plugin: PluginFold },
  { name: "cleanup", plugin: PluginCleanup },
  { name: "format", plugin: PluginFormat },
];

for (const { name, plugin } of plugins) {
  try {
    const ctx = { notes };
    const out = plugin(processedCode, ctx);
    if (out && out !== processedCode) {
      processedCode = out;
      pluginUsed = name;
    }
  } catch (err) {
    console.error(`插件 ${name} 处理时发生错误: ${err.message}`);
  }
}

// ---------------------- 输出结果 ----------------------
if (processedCode !== sourceCode) {
  const header = [
    `//${new Date().toUTCString()}`,
    `//Base:<url id="cv1cref6o68qmpt26ol0" type="url" status="parsed" title="GitHub - echo094/decode-js" wc="2165">https://github.com/echo094/decode-js</url>`,
    `//Modify:<url id="cv1cref6o68qmpt26olg" type="url" status="parsed" title="GitHub - smallfawn/decode_action" wc="741">https://github.com/smallfawn/decode_action</url>`,
  ].join("\n");

  const outputCode = header + "\n" + processedCode;
  fs.writeFileSync(decodeFile, outputCode, "utf-8");
  console.log(`命中插件：${pluginUsed}`);
  console.log(`使用插件 ${pluginUsed} 成功处理并写入文件 ${decodeFile}`);
  if (notes.length) console.log("Notes:", notes.join(" | "));
} else {
  console.log("所有插件处理后的代码与原代码一致，未写入文件。");
}