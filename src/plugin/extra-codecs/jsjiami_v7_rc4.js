// jsjiami_v7_rc4.js — 支持别名(_0xc3dd0a=_0x1e61) 与安全沙箱计算
import vm from "vm";

function evalStringTable(fnCode) {
  const context = { result: null };
  vm.createContext(context);
  const wrapped = `
    (function(){
      ${fnCode}
      if (typeof _0x1715 !== 'function') throw new Error('_0x1715 not found');
      return _0x1715();
    })()
  `;
  return vm.runInContext(wrapped, context, { timeout: 50 });
}

function makeDecoder(stringTable, indexOffset) {
  const b64 = (s) => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
    let str = "", out = "";
    for (let block = 0, charCode, i = 0, map = chars;
      (charCode = s.charAt(i++));
      ~charCode && (block = block ? block * 64 + charCode : charCode,
      i % 4) ? str += String.fromCharCode(255 & (block >> ((-2 * i) & 6))) : 0) {
      charCode = map.indexOf(charCode);
    }
    for (let i2 = 0, l = str.length; i2 < l; i2++) {
      out += "%" + ("00" + str.charCodeAt(i2).toString(16)).slice(-2);
    }
    return decodeURIComponent(out);
  };

  const rc4 = (data, key) => {
    const s = new Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0, x, res = "";
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
      [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0; j = 0;
    for (let y = 0; y < data.length; y++) {
      i = (i + 1) % 256;
      j = (j + s[i]) % 256;
      [s[i], s[j]] = [s[j], s[i]];
      x = s[(s[i] + s[j]) % 256];
      res += String.fromCharCode(data.charCodeAt(y) ^ x);
    }
    return res;
  };

  return (rawIndex, key) => {
    const idxNum = typeof rawIndex === "string" && rawIndex.startsWith("0x")
      ? parseInt(rawIndex, 16)
      : Number(rawIndex);
    const slot = stringTable[idxNum - indexOffset];
    if (typeof slot !== "string") return null;
    try {
      return rc4(b64(slot), key);
    } catch {
      return null;
    }
  };
}

function analyze(code) {
  const decDef =
    code.match(/function\s+([$\w]+)\s*\(\s*([$\w]+)\s*,\s*([$\w]+)\)\s*\{[^{}]*?\1\s*=\s*function|function\s+([$\w]+)\s*\(\s*([$\w]+)\s*,\s*([$\w]+)\)\s*\{/) ||
    code.match(/(?:var|let|const)\s+([$\w]+)\s*=\s*function\s*\(\s*([$\w]+)\s*,\s*([$\w]+)\)\s*\{/);

  const name = (decDef && (decDef[1] || decDef[4])) || null;
  if (!name) return null;

  const offM = code.match(new RegExp(`${name}\\s*=\\s*function\\s*\$begin:math:text$\\\\s*([\\\\w$]+)\\\\s*,[^)]*\\$end:math:text$\\s*\\{[^}]*?\\1\\s*=\\s*\\1\\s*-\\s*(0x[\\da-fA-F]+|\\d+)`));
  const indexOffset = offM ? parseInt(offM[2]) : 0xdd;

  const aliasRe = new RegExp(`(?:var|let|const)\\s+([\\w$]+)\\s*=\\s*${name}\\s*;`, "g");
  const aliases = new Set([name]);
  for (let m; (m = aliasRe.exec(code)); ) aliases.add(m[1]);

  const tblFnM = code.match(/function\s+_0x1715\s*\(\)\s*\{[\s\S]*?\}\s*;?/);
  if (!tblFnM) return null;

  return { name, aliases: [...aliases], tableFnCode: tblFnM[0], indexOffset };
}

export default function jsjiamiV7Rc4(code, { notes } = {}) {
  try {
    const info = analyze(code);
    if (!info) {
      notes?.push?.("jsjiamiV7Rc4: decryptor not found");
      return code;
    }

    let strTab;
    try {
      strTab = evalStringTable(info.tableFnCode);
      if (!Array.isArray(strTab)) throw 0;
    } catch {
      notes?.push?.("jsjiamiV7Rc4: string table eval failed");
      return code;
    }

    const decode = makeDecoder(strTab, info.indexOffset);

    const callee = info.aliases.map(n => n.replace(/[$]/g, "\\$")).join("|");
    const callRe = new RegExp(`\\b(?:${callee})\\s*\$begin:math:text$\\\\s*(0x[\\\\da-fA-F]+|\\\\d+)\\\\s*,\\\\s*'([^'\\\\\\\\]*)'\\\\s*\\$end:math:text$`, "g");

    let replaced = 0;
    const out = code.replace(callRe, (_, idx, key) => {
      const s = decode(idx, key);
      if (typeof s === "string") {
        replaced++;
        return JSON.stringify(s);
      }
      return _;
    });

    notes?.push?.(`jsjiamiV7Rc4: replaced ${replaced} calls (aliases: ${info.aliases.join(",")})`);
    return out;
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: ${e.message}`);
    return code;
  }
}