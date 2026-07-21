import { questionApi, handleApiError } from '~/api/index';
import { QuestionParams } from '~/api/param/param_question';
import { openPage } from '~/utils/router';

const { renderMarkdown } = require('../../../utils/towxmlLoader');

function unwrapDetail(res) {
  if (!res || typeof res !== 'object') return {};
  let d = res.data !== undefined ? res.data : res;
  if (d && typeof d === 'object' && d.data !== undefined && d.title === undefined && d.content === undefined) {
    d = d.data;
  }
  return d && typeof d === 'object' ? d : {};
}

/** 列表/详情日期：YYYY-MM-DD */
function formatDateYMD(value) {
  if (value === undefined || value === null || value === '') return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const mo = `${m[2]}`.padStart(2, '0');
    const d = `${m[3]}`.padStart(2, '0');
    return `${m[1]}-${mo}-${d}`;
  }
  const d = new Date(s.replace(/-/g, '/'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10) || '';
  const y = d.getFullYear();
  const mo = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

Page({
  data: {
    loading: true,
    docId: '',
    docTitle: '',
    categoryName: '',
    displayDate: '',
    viewCount: '',
    shareTitle: '',
    renderedContent: null
  },

  onLoad(options) {
    const id = options.id != null && options.id !== '' ? String(options.id) : '';
    if (!id) {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少文档 id', icon: 'none' });
      return;
    }
    this.setData({ docId: id });
    this._load(id);
    if (options.share === '1') {
      setTimeout(() => {
        wx.showToast({ title: '可点击下方分享', icon: 'none' });
      }, 400);
    }
  },

  onPullDownRefresh() {
    if (!this.data.docId) return Promise.resolve();
    return this._load(this.data.docId);
  },

  async _load(id) {
    this.setData({ loading: true });
    try {
      const questionDetail = new QuestionParams(null, null, id);
      const res = await questionApi.getQuestionDetail(questionDetail);
      const row = unwrapDetail(res);
      const docTitle = row.title || '';
      const markdownContent = row.content || row.markdownContent || '';
      const categoryName =
        row.categoryName || row.category_name || row.categoryLabel || '';
      const rawTime =
        row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? row.createAt;
      const displayDate = formatDateYMD(rawTime);
      const viewRaw = row.viewCount ?? row.view_count;
      const viewCount =
        viewRaw === undefined || viewRaw === null || viewRaw === '' ? '' : String(viewRaw);

      const shareTitle = docTitle || '文档预览';
      const renderedContent = markdownContent
        ? await renderMarkdown(String(markdownContent), { theme: 'light', base: '', events: {} })
        : null;

      this.setData({
        loading: false,
        docTitle,
        categoryName,
        displayDate,
        viewCount,
        renderedContent,
        shareTitle
      });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      handleApiError(e, { fallbackMessage: '加载失败' });
    }
  },

  onGoEdit() {
    const id = this.data.docId;
    if (!id) return;
    wx.setStorageSync('release_edit_doc_id', String(id));

    openPage({
      url: `/pages/document/edit/index?id=${encodeURIComponent(id)}`,
      fail: function (res) {
        console.log('跳转失败', res);
      }
    });
  },

  onShareAppMessage() {
    const id = this.data.docId;
    const title = this.data.shareTitle || '文档预览';
    return {
      title,
      path: id ? `pages/document/preview/index?id=${encodeURIComponent(id)}` : 'pages/document/index'
    };
  }
});
