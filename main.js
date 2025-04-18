import fs from 'fs';
import path from 'path';
import process from 'process';

// 动态导入插件
import * as jsfuck from './plugin/jsfuck.js';
import * as aadecode from './plugin/aadecode.js';

// 插件列表（按顺序尝试）
const plugins = [jsfuck, aadecode];

// 加载输入脚本
const inputPath = './input.js';
let code = fs.readFileSync(inputPath, 'utf-8');

// 按插件顺序处理
let processedCode = null;

for (const plugin of plugins) {
  try {
    const result = await plugin.handle(code);
    if (result && result !== code) {
      console.log(`[main] 插件 ${plugin.name} 成功处理`);
      processedCode = result;
      break;
    }
  } catch (e) {
    console.warn(`[main] 插件 ${plugin.name} 处理失败: ${e.message}`);
  }
}

if (!processedCode) {
  console.warn('[main] 所有插件均未能成功解密，写入原始输入');
  processedCode = code;
}

// 写入输出
fs.writeFileSync('./output.js', processedCode, 'utf-8');
console.log('[main] 已写入 output.js');