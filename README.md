# GitHub JS Deobfuscator

## 使用
1. 把混淆脚本放到 `input/` 下（可多文件）。
2. 推送到 GitHub，Actions 会自动运行。
3. 明文（或清壳+美化）输出到 `output/*.deobf.js`，同时 artifacts 可下载。

## 支持
- 识别/尝试：AAEncode、JSFuck、jsjiami v7（插件可扩展）
- 全流程失败时，进行格式化保证可读性
- 插件接口：`export default async function (input) => string|null`

## 风险
- 运行期还原在 `isolated-vm` 沙箱中执行，受内存/时长限制。
- 不保证所有样本 100% 还原，建议针对样本扩展 `plugins/*`。
