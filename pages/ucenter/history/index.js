import Message from 'tdesign-miniprogram/message/index';
import {
  getQuestionBrowseHistory,
  clearQuestionBrowseHistory,
  removeQuestionBrowseById
} from '~/utils/questionBrowseHistory';

const app = getApp();

function formatViewedAt(ts) {
  if (!ts) return '';
  const t = typeof ts === 'number' ? ts : Number(ts);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const now = new Date();
  const pad = (n) => `${n}`.padStart(2, '0');
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const ySame =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate();
  if (ySame) {
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    list: [],
    loading: true
  },

  onShow() {
    this.refreshList();
  },

  refreshList() {
    const raw = getQuestionBrowseHistory();
    const list = raw.map((row, idx) => ({
      ...row,
      idx: idx + 1,
      timeText: formatViewedAt(row.viewedAt)
    }));
    this.setData({ list, loading: false });
  },

  onQuestionTap(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${id}&title=${encodeURIComponent(title || '')}`
    });
  },

  onRemoveOne(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    removeQuestionBrowseById(id);
    this.refreshList();
    Message.success({
      context: this,
      offset: [20, 32],
      duration: 1500,
      content: '已移除'
    });
  },

  onClearAll() {
    const { list } = this.data;
    if (!list.length) return;
    wx.showModal({
      title: '清空浏览历史',
      content: '将删除本机保存的全部浏览记录，且不可恢复。',
      confirmColor: '#0064ff',
      success: (res) => {
        if (!res.confirm) return;
        clearQuestionBrowseHistory();
        this.refreshList();
        Message.success({
          context: this,
          offset: [20, 32],
          duration: 2000,
          content: '已清空'
        });
      }
    });
  },

  goPractice() {
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => {
        wx.navigateTo({ url: '/pages/category/index' });
      }
    });
  }
});
