import { authApi } from '~/api/request/api_question';
import { QuestionParams } from '~/api/param/param_question';
const app = getApp();

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

Page({
  data: {
    loading: true,
    docId: '',
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
        wx.showToast({ title: '可点击下方分享给好友', icon: 'none' });
      }, 400);
    }
  },

  async _load(id) {
    this.setData({ loading: true });
    try {
      const questionDetail = new QuestionParams(null, null, id)

      const res = await authApi.getQuestionDetail(questionDetail);
    
      const row = unwrapDetail(res);
      const docTitle = row.title || '';
      const markdownContent = row.content || row.markdownContent || '';
      const categoryName =
        row.categoryName || row.category_name || row.categoryLabel || '';
      const full = row.previewFullContent || row.preview_full_content || '';
      const md = full && String(full).trim() ? String(full) : buildFullPreviewContent(docTitle, categoryName, markdownContent);

      let renderedContent = null;
      if (app.towxml && md) {
        try {
          renderedContent = app.towxml(md, 'markdown', {
            theme: 'light',
            base: '',
            events: {}
          });
        } catch (e) {
          console.error('towxml', e);
        }
      }

      const shareTitle = docTitle || '文档预览';
      this.setData({
        loading: false,
        renderedContent,
        shareTitle
      });
      wx.setNavigationBarTitle({ title: shareTitle.slice(0, 18) + (shareTitle.length > 18 ? '…' : '') });
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

  onShareAppMessage() {
    const id = this.data.docId;
    const title = this.data.shareTitle || '文档预览';
    return {
      title,
      path: id ? `pages/document/preview/index?id=${encodeURIComponent(id)}` : 'pages/document/index'
    };
  }
});
