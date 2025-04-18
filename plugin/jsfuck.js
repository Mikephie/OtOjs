export const name = 'JSFuck 解密插件';

export async function handle(code) {
  const isJSFuck = /^[\[\]\(\)\!\+]{20,}$/.test(code);
  if (!isJSFuck) return null;

  try {
    const decoded = eval(code); // 简化测试：仅解出一级内容
    if (typeof decoded === 'string') {
      return decoded;
    }
    return null;
  } catch (err) {
    console.warn(`[JSFuck] 解密失败: ${err.message}`);
    return null;
  }
}
