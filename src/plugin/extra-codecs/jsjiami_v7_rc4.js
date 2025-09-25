// src/plugin/extra-codecs/jsjiami_v7_rc4.js
// 简单 RC4 解码尝试：匹配 _0x1e61(<num>, "<key>") 并替换

export default function jsjiamiV7Rc4(code, { notes } = {}) {
  const rc4 = (str, key) => {
    const data = atob(str);
    const s = Array(256).fill(0).map((_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
      [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0; j = 0;
    return data.split('').map(c => {
      i = (i + 1) % 256;
      j = (j + s[i]) % 256;
      [s[i], s[j]] = [s[j], s[i]];
      const k = s[(s[i] + s[j]) % 256];
      return String.fromCharCode(c.charCodeAt(0) ^ k);
    }).join('');
  };

  let changed = false;
  const out = code.replace(/_0x1e61\s*\(\s*(0x[0-9a-f]+|\d+)\s*,\s*['"]([^'"]+)['"]\s*\)/g,
    (_, num, key) => {
      try {
        const val = rc4(String(num), key);
        changed = true;
        return JSON.stringify(val);
      } catch {
        return _;
      }
    });

  if (changed) notes?.push?.('jsjiami_v7_rc4: replaced rc4 calls');
  return out;
}