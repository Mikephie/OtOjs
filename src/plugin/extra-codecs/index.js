// plugin/extra-codecs/index.js
// 自动加载同目录下的所有插件（除了 index.js）

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runExtraCodecs(source, ctx = {}) {
  let processed = source;

  // 找到目录下所有 js 文件（排除 index.js 本身）
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.js') && f !== 'index.js');

  for (const file of files) {
    try {
      const mod = await import(path.join(__dirname, file));
      const plugin = mod.default || mod.run || null;

      if (typeof plugin === 'function') {
        const before = processed;
        const ret = await plugin(before, ctx);
        const after = (typeof ret === 'string') ? ret : before;

        if (after !== before) {
          ctx?.notes?.push(`[extra-codecs] ${file} 生效`);
          processed = after;
        }
      }
    } catch (e) {
      ctx?.notes?.push(`[extra-codecs] ${file} 加载失败: ${e.message}`);
    }
  }

  return processed;
}

export default runExtraCodecs;