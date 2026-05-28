/**
 * 跨分包异步加载 towxml（主包/其它分包不可同步 require 分包内 JS）
 */
let parser = null;
let loading = null;

// 须相对本文件路径；以 / 开头会被解析成 utils/subpackages/... 导致找不到模块
const TOWXML_ENTRY = '../subpackages/towxml/index';

function getTowxmlParser() {
  if (parser) {
    return Promise.resolve(parser);
  }
  if (!loading) {
    loading = require
      .async(TOWXML_ENTRY)
      .then((mod) => {
        parser = mod.default || mod;
        return parser;
      })
      .catch((err) => {
        loading = null;
        console.error('[towxml] load failed', err);
        throw err;
      });
  }
  return loading;
}

function renderMarkdown(content, options = {}) {
  if (!content) {
    return Promise.resolve(null);
  }
  const opts = {
    theme: 'light',
    events: {},
    ...options,
  };
  return getTowxmlParser().then((Towxml) => {
    try {
      return Towxml(content, 'markdown', opts);
    } catch (e) {
      console.warn('[towxml] render failed', e);
      return null;
    }
  });
}

function warmupTowxml() {
  return getTowxmlParser().catch(() => null);
}

module.exports = {
  getTowxmlParser,
  renderMarkdown,
  warmupTowxml,
};
