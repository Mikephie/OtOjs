// plugin/extra-codecs/jsjiami_v7_rc4.js
// 专门处理 jsjiami.com.v7 RC4 变体

/**
 * RC4 解密函数
 */
function rc4(data, key) {
  let s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0, x, res = '';
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  i = j = 0;
  for (let y = 0; y < data.length; y++) {
    i = (i + 1) % 256;
    j = (j + s[i]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
    x = s[(s[i] + s[j]) % 256];
    res += String.fromCharCode(data.charCodeAt(y) ^ x);
  }
  return res;
}

/**
 * 插件入口
 */
export default async function jsjiamiV7Rc4Plugin(source, ctx = {}) {
  try {
    // 检测是否包含 jsjiami v7 的标记
    if (!/jsjiami\.com\.v7/.test(source)) {
      return source; // 不处理
    }

    // 提取 var _0xodH = 'xxxx';
    let keyMatch = source.match(/var\s+_0xodH\s*=\s*['"]([^'"]+)['"]/);
    let key = keyMatch ? keyMatch[1] : null;

    if (!key) {
      ctx?.notes?.push('[extra-codecs] jsjiamiV7Rc4: 未找到 _0xodH');
      return source;
    }

    // 找到加密字符串数组 (常见写法 function _0x1715() { return [ ... ]; })
    let arrMatch = source.match(/function\s+_0x[0-9a-fA-F]+\s*\(\)\s*{[^}]*return\s*\[([\s\S]*?)\]/);
    if (!arrMatch) {
      ctx?.notes?.push('[extra-codecs] jsjiamiV7Rc4: 未找到字符串数组');
      return source;
    }

    // 提取字符串数组
    let rawArr = arrMatch[1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''));

    let decodedArr = [];
    for (let str of rawArr) {
      try {
        decodedArr.push(rc4(str, key));
      } catch (e) {
        decodedArr.push(str);
      }
    }

    ctx?.notes?.push(`[extra-codecs] jsjiamiV7Rc4: 成功解码 ${decodedArr.length} 条字符串`);

    // 替换源码（仅替换数组部分，保留原始结构）
    let newSource = source.replace(arrMatch[0], `function _0x1715(){ return ${JSON.stringify(decodedArr)} }`);

    return newSource;
  } catch (e) {
    ctx?.notes?.push(`[extra-codecs] jsjiamiV7Rc4 failed: ${e.message}`);
    return source;
  }
}