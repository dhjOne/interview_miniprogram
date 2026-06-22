import { authApi } from '~/api/request/api_question';
import { QuestionParams } from '~/api/param/param_question';
import { resolveAuthorId } from '~/utils/author';
import { completeSelfQuiz } from '~/utils/points';

const app = getApp();
const { renderMarkdown } = require('../../../utils/towxmlLoader');

function unwrapDetail(res) {
  if (!res || typeof res !== 'object') return {};
  let d = res.data !== undefined ? res.data : res;
  if (d && typeof d === 'object' && d.data !== undefined && d.title === undefined && d.content === undefined) {
    d = d.data;
  }
  return d && typeof d === 'object' ? d : {};
}

function buildFullPreviewContent(docTitle, categoryName, markdownContent) {
  let fullContent = '';
  if (docTitle) {
    fullContent += `<div style="text-align: center; margin-bottom: 40rpx;">\n`;
    fullContent += `  <h1 style="font-size: 48rpx; font-weight: 700; color: #1d2129; margin: 0;">${docTitle}</h1>\n`;
    if (categoryName) {
      fullContent += `  <div style="text-align: right; margin: 0;">\n`;
      fullContent += `    <span style="background: #165dff; color: white; padding: 4rpx 16rpx; border-radius: 16rpx; font-size: 24rpx; display: inline-block;">${categoryName}</span>\n`;
      fullContent += `  </div>\n`;
    }
    fullContent += `</div>\n\n`;
  }
  fullContent += markdownContent || '';
  return fullContent;
}

function resolveCurrentUserId() {
  const user = app.getUserInfo && app.getUserInfo();
  if (!user) return '';
  return String(user.id ?? user.userId ?? user.user_id ?? '');
}

function isPublishedStatus(row) {
  const status = row.status ?? row.docStatus ?? row.doc_status;
  return Number(status) === 2;
}

Page({
  data: {
    loading: true,
    docId: '',
    shareTitle: '',
    renderedContent: null,
    showSelfQuiz: false,
    selfQuizSubmitting: false
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
        wx.showToast({ title: '可点击下方分享给好友', icon: 'none' });
      }, 400);
    }
  },

  async _load(id) {
    this.setData({ loading: true });
    try {
      const questionDetail = new QuestionParams(null, null, id);
      const res = await authApi.getQuestionDetail(questionDetail);
      const row = unwrapDetail(res);
      const docTitle = row.title || '';
      const markdownContent = row.content || row.markdownContent || '';
      const categoryName =
        row.categoryName || row.category_name || row.categoryLabel || '';
      const full = row.previewFullContent || row.preview_full_content || '';
      const md = full && String(full).trim() ? String(full) : 
      buildFullPreviewContent(docTitle, categoryName, markdownContent);

      const shareTitle = docTitle || '文档预览';
      const renderedContent = md
        ? await renderMarkdown(md, { theme: 'light', base: '', events: {} })
        : null;

      const authorId = resolveAuthorId(row);
      const currentUserId = resolveCurrentUserId();
      const showSelfQuiz = !!(currentUserId && authorId && currentUserId === authorId && isPublishedStatus(row));

      this.setData({
        loading: false,
        renderedContent,
        shareTitle,
        showSelfQuiz
      });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
    }
  },

  onGoEdit() {
    const id = this.data.docId;
    if (!id) return;
    wx.setStorageSync('release_edit_doc_id', String(id));

    wx.navigateTo({
      url: `/pages/document/edit/index?id=${encodeURIComponent(id)}`,
      fail: function (res) {
        console.log('跳转失败', res);
      }
    });
  },

  async onSelfQuizComplete() {
    const id = this.data.docId;
    if (!id || this.data.selfQuizSubmitting) return;
    this.setData({ selfQuizSubmitting: true });
    try {
      await completeSelfQuiz(id);
      wx.showToast({ title: '自测完成，积分已发放', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' });
    } finally {
      this.setData({ selfQuizSubmitting: false });
    }
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
