export const name = 'AAEncode 解密插件';

import { VM } from 'vm2';

export async function handle(code) {
  const isAAEncoded = code.includes('ﾟωﾟ') || code.includes('｀;´');
  if (!isAAEncoded) return null;

  try {
    const vm = new VM({ timeout: 3000 });
    const result = vm.run(code);
    if (typeof result === 'string') {
      return result;
    }
    return null;
  } catch (err) {
    console.warn(`[AAEncode] 解密失败: ${err.message}`);
    return null;
  }
}