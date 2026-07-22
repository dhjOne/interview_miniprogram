/**
 * 提交前只处理暂存文件。
 * - wxml/wxss：Prettier 无官方解析器，不进 hook
 * - js：先 eslint --fix，再 prettier（同一组任务按数组顺序串行）
 */
module.exports = {
  '*.{js,ts}': ['eslint --fix --cache', 'prettier --write'],
  '*.{json,less,md}': ['prettier --write'],
};
