// src/plugin/extra-codecs/jsjiami_v7_rc4.js

export default function jsjiamiV7Rc4(code, { notes } = {}) {
  try {
    let out = code;

    // 常见“开关位”清理（安全幂等）
    const before = out;
    out = out
      .replace(/"isObfuscated":\s*true/g, '"isObfuscated":false')
      .replace(/"obfuscatedPath":"[^"]*"/g, '"obfuscatedPath":null')
      .replace(/"isNsfw":\s*true/g, '"isNsfw":false')
      .replace(/"isAdPersonalizationAllowed":\s*true/g, '"isAdPersonalizationAllowed":false')
      .replace(/"isThirdPartyInfoAdPersonalizationAllowed":\s*true/g, '"isThirdPartyInfoAdPersonalizationAllowed":false')
      .replace(/"isNsfwMediaBlocked":\s*true/g, '"isNsfwMediaBlocked":false')
      .replace(/"isNsfwContentShown":\s*true/g, '"isNsfwContentShown":false')
      .replace(/"isPremiumMember":\s*false/g, '"isPremiumMember":true')
      .replace(/"isEmployee":\s*false/g, '"isEmployee":true');

    if (out !== before) {
      notes?.push?.('jsjiamiV7Rc4: flags cleaned');
      return out;
    }

    // 未命中任何规则
    notes?.push?.('jsjiamiV7Rc4: no changes');
    return code;
  } catch (e) {
    notes?.push?.(`jsjiamiV7Rc4: ${e.message}`);
    return code;
  }
}
