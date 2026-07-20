import { searchApi, unwrapData, handleApiError } from '~/api/index';
import { openPage } from '~/utils/router';

const LOCAL_HISTORY_KEY = 'mini_search_history';
const MAX_LOCAL_HISTORY = 20;

function isLoggedIn() {
  try {
    return !!wx.getStorageSync('access_token');
  } catch (error) {
    return false;
  }
}

function readLocalHistory() {
  try {
    const raw = wx.getStorageSync(LOCAL_HISTORY_KEY);
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function writeLocalHistory(words) {
  try {
    wx.setStorageSync(LOCAL_HISTORY_KEY, words.slice(0, MAX_LOCAL_HISTORY));
  } catch (error) {
    // ignore
  }
}

function upsertLocalHistory(keyword) {
  const value = (keyword || '').trim();
  if (!value) return readLocalHistory();
  const words = readLocalHistory().filter((item) => item !== value);
  words.unshift(value);
  writeLocalHistory(words);
  return words.slice(0, MAX_LOCAL_HISTORY);
}

Page({
  data: {
    historyItems: [],
    historyWords: [],
    popularWords: [],
    searchValue: '',
    dialog: {
      title: '确认删除当前历史记录',
      showCancelButton: true,
      message: ''
    },
    dialogShow: false
  },

  deleteType: 0,
  deleteIndex: '',

  onShow() {
    this.queryHistory();
    this.queryPopular();
  },

  onPullDownRefresh() {
    return Promise.all([
      this.queryHistory(),
      this.queryPopular()
    ]);
  },

  async queryHistory() {
    if (isLoggedIn()) {
      try {
        const data = unwrapData(await searchApi.getHistory()) || {};
        const items = data.items || [];
        const historyWords = data.historyWords || items.map((item) => item.keyword);
        this.setData({ historyItems: items, historyWords });
        return;
      } catch (error) {
        console.warn('[search] 读取服务端历史失败，降级本地缓存', error);
      }
    }

    const historyWords = readLocalHistory();
    this.setData({
      historyWords,
      historyItems: historyWords.map((keyword, index) => ({ id: index, keyword }))
    });
  },

  async queryPopular() {
    try {
      const data = unwrapData(await searchApi.getPopular()) || {};
      this.setData({
        popularWords: data.popularWords || []
      });
    } catch (error) {
      console.warn('[search] 读取热门搜索失败', error);
    }
  },

  async persistHistory(keyword) {
    const value = (keyword || '').trim();
    if (!value) return;

    if (isLoggedIn()) {
      try {
        await searchApi.saveHistory(value);
        await this.queryHistory();
        return;
      } catch (error) {
        console.warn('[search] 保存服务端历史失败，降级本地缓存', error);
      }
    }

    const historyWords = upsertLocalHistory(value);
    this.setData({
      historyWords,
      historyItems: historyWords.map((item, index) => ({ id: index, keyword: item }))
    });
  },

  navigateToResult(keyword) {
    const value = (keyword || '').trim();
    if (!value) return;
    openPage({
      url: `/pages/search/result/index?keyword=${encodeURIComponent(value)}`
    });
  },

  async setHistoryWords(searchValue) {
    const value = (searchValue || '').trim();
    if (!value) return;

    this.setData({ searchValue: value });
    await this.persistHistory(value);
    this.navigateToResult(value);
  },

  async confirm() {
    const { historyItems } = this.data;
    const { deleteType, deleteIndex } = this;

    if (deleteType === 0) {
      const item = historyItems[deleteIndex];
      if (!item) {
        this.setData({ dialogShow: false });
        return;
      }

      if (isLoggedIn() && item.id != null && typeof item.id === 'number' && item.id > 0) {
        try {
          await searchApi.deleteHistory(item.id);
        } catch (error) {
          handleApiError(error, { fallbackMessage: '删除失败，请重试' });
          this.setData({ dialogShow: false });
          return;
        }
      } else {
        const historyWords = readLocalHistory().filter((_, index) => index !== deleteIndex);
        writeLocalHistory(historyWords);
      }
      await this.queryHistory();
      this.setData({ dialogShow: false });
      return;
    }

    if (isLoggedIn()) {
      try {
        await searchApi.clearHistory();
      } catch (error) {
        handleApiError(error, { fallbackMessage: '清空失败，请重试' });
        this.setData({ dialogShow: false });
        return;
      }
    } else {
      writeLocalHistory([]);
    }

    await this.queryHistory();
    this.setData({ dialogShow: false });
  },

  close() {
    this.setData({ dialogShow: false });
  },

  handleClearHistory() {
    const { dialog } = this.data;
    this.deleteType = 1;
    this.setData({
      dialog: {
        ...dialog,
        message: '确认删除所有历史记录'
      },
      dialogShow: true
    });
  },

  deleteCurr(e) {
    const { index } = e.currentTarget.dataset;
    const { dialog } = this.data;
    this.deleteIndex = index;
    this.deleteType = 0;
    this.setData({
      dialog: {
        ...dialog,
        message: '确认删除当前历史记录'
      },
      dialogShow: true
    });
  },

  handleHistoryTap(e) {
    const { historyWords } = this.data;
    const { index } = e.currentTarget.dataset;
    const searchValue = historyWords[index || 0] || '';
    this.setHistoryWords(searchValue);
  },

  handlePopularTap(e) {
    const { popularWords } = this.data;
    const { index } = e.currentTarget.dataset;
    const searchValue = popularWords[index || 0] || '';
    this.setHistoryWords(searchValue);
  },

  handleSubmit(e) {
    const { value } = e.detail;
    if (!value || !String(value).trim()) return;
    this.setHistoryWords(String(value).trim());
  },

  actionHandle() {
    this.setData({ searchValue: '' });
    openPage({ url: '/pages/category/index' });
  }
});
