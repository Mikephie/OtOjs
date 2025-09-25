// src/main.js — 解密主入口（完整版）

import fs from "fs";
import process from "process";

// ---------------------- 可选：编码库预处理 ----------------------
let runExtraCodecs = null;
try {
  const extra = await import("./plugin/extra-codecs/index.js");
  runExtraCodecs = extra.runExtraCodecs || extra.default || null;
} catch (_) {
  // 忽略：没有 extra-codecs 目录也能正常跑
}

// ---------------------- 动态加载原有插件 ----------------------
const commonModule      = await import("./plugin/common.js");
const jjencodeModule    = await import("./plugin/jjencode.js");
const sojsonModule      = await import("./plugin/sojson.js");
const sojsonv7Module    = await import("./plugin/sojsonv7.js");
const obfuscatorModule  = await import("./plugin/obfuscator.js");
const awscModule        = await import("./plugin/awsc.js");
const jsconfuserModule  = await import("./plugin/jsconfuser.js");

// 新增：cleanup + format
const cleanupModule     = await import("./plugin/cleanup.js");
const formatModule      = await import("./plugin/format.js");

// 兼容 default / 命名导出
const PluginCommon     = commonModule.default     ?? commonModule;
const PluginJjencode   = jjencodeModule.default   ?? jjencodeModule;
const PluginSojson     = sojsonModule.default     ?? sojsonModule;
const PluginSojsonV7   = sojsonv7Module.default   ?? sojsonv7Module;
const PluginObfuscator = obfuscatorModule.default ?? obfuscatorModule;
const PluginAwsc       = awscModule.default       ?? awscModule;
const PluginJsconfuser = jsconfuserModule.default ?? jsconfuserModule;
const PluginCleanup    = cleanupModule.default    ?? cleanupModule;
const PluginFormat     = formatModule.default     ?? formatModule;

// ---------------------- 输入/输出文件 ----------------------
let encodeFile = "input.js";
let decodeFile = "output.js";

for (let i = 2; i < process.argv.length; i += 2) {
  if (process.argv[i] === "-i") encodeFile = process.argv[i + 1];
  if (process.argv[i] === "-o") decodeFile = process.argv[i + 1];
}

console.log(`输入: ${encodeFile}`);
console.log(`输出: ${decodeFile}`);

// ---------------------- 读取源代码 ----------------------
const sourceCode = fs.readFileSync(encodeFile, "utf-8");
let processedCode = sourceCode;
let pluginUsed = "";
const notes = [];

// ---------------------- 先跑 extra-codecs ----------------------
if (runExtraCodecs) {
  try {
    const ret = await runExtraCodecs(processedCode, { notes });
    const after = typeof ret === "string" ? ret : (ret?.code ?? processedCode);
    if (after !== processedCode) {
      processedCode = after;
      console.log("预处理（extra-codecs）已替换部分字符串/解码调用");
    }
  } catch (e) {
    console.error(`[extra-codecs] 运行失败: ${e.message}`);
  }
}

// ---------------------- 插件链顺序 ----------------------
const plugins = [
  { name: "obfuscator", plugin: PluginObfuscator },
  { name: "sojsonv7",   plugin: PluginSojsonV7 },
  { name: "sojson",     plugin: PluginSojson },
  { name: "jsconfuser", plugin: PluginJsconfuser },
  { name: "awsc",       plugin: PluginAwsc },
  { name: "jjencode",   plugin: PluginJjencode },
  { name: "common",     plugin: PluginCommon },
  { name: "cleanup",    plugin: PluginCleanup },
  { name: "format",     plugin: PluginFormat }
];

for (const { name, plugin } of plugins) {
  try {
    const code = await plugin(processedCode, { notes });
    if (code && code !== processedCode) {
      processedCode = code;
      pluginUsed = name;
      console.log(`命中插件：${name}`);
    }
  } catch (e) {
    console.error(`插件 ${name} 处理时发生错误: ${e.message}`);
  }
}

// ---------------------- 写入文件 ----------------------
if (processedCode !== sourceCode) {
  const time = new Date();
  const header = [
    `//${time}`,
    "//Base:<url id=\"cv1cref6o68qmpt26ol0\" type=\"url\" status=\"parsed\" title=\"GitHub - echo094/decode-js: JS混淆代码的AST分析工具 AST analysis tool for obfuscated JS code\" wc=\"2165\">https://github.com/echo094/decode-js</url>",
    "//Modify:<url id=\"cv1cref6o68qmpt26olg\" type=\"url\" status=\"parsed\" title=\"GitHub - smallfawn/decode_action: 世界上本来不存在加密，加密的人多了，也便成就了解密\" wc=\"741\">https://github.com/smallfawn/decode_action</url>"
  ].join("\n");

  fs.writeFileSync(decodeFile, header + "\n" + processedCode, "utf-8");
  console.log(`使用插件 ${pluginUsed || "extra-codecs"} 成功处理并写入文件 ${decodeFile}`);
  if (notes.length) console.log("Notes:", notes.join(" | "));
} else {
  console.log("所有插件处理后的代码与原代码一致，未写入文件。");
}