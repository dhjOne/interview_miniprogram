import {
  fetchPointAccount,
  fetchPointLedger,
  fetchPointRules,
  formatPointCount,
  submitPointAppeal
} from '~/utils/points';

Page({
  data: {
    account: {
      availablePoints: 0,
      pendingPoints: 0,
      lifetimeEarned: 0,
      lifetimeSpent: 0,
      reputationLevel: 0
    },
    displayAvailable: '0',
    displayPending: '0',
    displayEarned: '0',
    displaySpent: '0',
    ruleList: [],
    rulesExpanded: false,
    rulesLoading: false,
    ledgerList: [],
    hasMore: true,
    page: 1,
    pageSize: 20,
    loading: false,
    loadDone: false,
    loadError: false,
    errorMessage: '',
    showAppealDialog: false,
    appealLedgerId: '',
    appealReason: '',
    appealSubmitting: false
  },

  onLoad() {
    this.reload();
  },

  onShow() {
    this.loadAccount();
  },

  onReachBottom() {
    this.fetchLedger(false);
  },

  onPullDownRefresh() {
    return this.reload();
  },

  reload() {
    return new Promise((resolve) => {
      this.setData(
        {
          ledgerList: [],
          page: 0,
          hasMore: true,
          loadError: false,
          errorMessage: '',
          loadDone: false
        },
        () => {
          resolve(Promise.all([
            this.loadAccount(),
            this.loadRules(),
            this.fetchLedger(true)
          ]));
        }
      );
    });
  },

  async loadAccount() {
    try {
      const account = await fetchPointAccount();
      this.setData({
        account,
        displayAvailable: formatPointCount(account.availablePoints),
        displayPending: formatPointCount(account.pendingPoints),
        displayEarned: formatPointCount(account.lifetimeEarned),
        displaySpent: formatPointCount(account.lifetimeSpent)
      });
    } catch (e) {
      console.warn('[points] 账户加载失败', e);
    }
  },

  async loadRules() {
    this.setData({ rulesLoading: true });
    try {
      const ruleList = await fetchPointRules();
      this.setData({ ruleList });
    } catch (e) {
      console.warn('[points] 规则加载失败', e);
    } finally {
      this.setData({ rulesLoading: false });
    }
  },

  toggleRules() {
    this.setData({ rulesExpanded: !this.data.rulesExpanded });
  },

  goRedeem() {
    wx.navigateTo({ url: '/pages/ucenter/points/redeem/index' });
  },

  goAppeals() {
    wx.navigateTo({ url: '/pages/ucenter/points/appeals/index' });
  },

  goInvite() {
    wx.navigateTo({ url: '/pages/ucenter/points/invite/index' });
  },

  onAppealTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({
      showAppealDialog: true,
      appealLedgerId: String(id),
      appealReason: ''
    });
  },

  onAppealReasonChange(e) {
    this.setData({ appealReason: e.detail.value || '' });
  },

  onAppealDialogClose() {
    if (this.data.appealSubmitting) return;
    this.setData({ showAppealDialog: false, appealLedgerId: '', appealReason: '' });
  },

  async onAppealConfirm() {
    const reason = (this.data.appealReason || '').trim();
    if (!reason) {
      wx.showToast({ title: '请填写申诉原因', icon: 'none' });
      return;
    }
    this.setData({ appealSubmitting: true });
    try {
      await submitPointAppeal(this.data.appealLedgerId, reason);
      wx.showToast({ title: '申诉已提交', icon: 'success' });
      this.setData({ showAppealDialog: false, appealLedgerId: '', appealReason: '' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' });
    } finally {
      this.setData({ appealSubmitting: false });
    }
  },

  async fetchLedger(isRefresh) {
    if (this.data.loading) return;
    if (!isRefresh && !this.data.hasMore) return;

    const nextPage = isRefresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const { list, total } = await fetchPointLedger(nextPage, this.data.pageSize);
      const merged = isRefresh ? list : [...this.data.ledgerList, ...list];
      const hasMore = typeof total === 'number' ? merged.length < total : list.length >= this.data.pageSize;

      this.setData({
        ledgerList: merged,
        page: nextPage,
        hasMore,
        loadDone: true,
        loadError: false
      });
    } catch (e) {
      console.error('[points] 流水加载失败:', e);
      const msg = (e && (e.message || e.msg)) || '';
      this.setData({
        loadError: !!isRefresh,
        errorMessage: msg || '服务暂不可用',
        loadDone: true
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  goCategory() {
    wx.switchTab({
      url: '/pages/category/index',
      fail: () => {
        wx.navigateTo({ url: '/pages/category/index' });
      }
    });
  }
});
