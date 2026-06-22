import {
  fetchPointAccount,
  fetchRedeemItems,
  fetchRedeemOrders,
  formatPointCount,
  redeemPointItem
} from '~/utils/points';

Page({
  data: {
    availablePoints: 0,
    displayAvailable: '0',
    itemList: [],
    orderList: [],
    tab: 'shop',
    loadingShop: false,
    loadingOrders: false,
    redeemingCode: ''
  },

  onLoad() {
    this.loadAccount();
    this.loadItems();
    this.loadOrders();
  },

  onShow() {
    this.loadAccount();
  },

  async loadAccount() {
    try {
      const account = await fetchPointAccount();
      this.setData({
        availablePoints: account.availablePoints,
        displayAvailable: formatPointCount(account.availablePoints)
      });
    } catch (e) {
      console.warn('[redeem] 账户加载失败', e);
    }
  },

  async loadItems() {
    this.setData({ loadingShop: true });
    try {
      const itemList = await fetchRedeemItems();
      this.setData({ itemList });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '商品加载失败', icon: 'none' });
    } finally {
      this.setData({ loadingShop: false });
    }
  },

  async loadOrders() {
    this.setData({ loadingOrders: true });
    try {
      const orderList = await fetchRedeemOrders();
      this.setData({ orderList });
    } catch (e) {
      console.warn('[redeem] 订单加载失败', e);
    } finally {
      this.setData({ loadingOrders: false });
    }
  },

  onTabTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.tab) return;
    this.setData({ tab });
  },

  onRedeemTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.itemCode) return;
    if (this.data.redeemingCode) return;

    wx.showModal({
      title: '确认兑换',
      content: `使用 ${item.costPoints} 积分兑换「${item.itemName}」？`,
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ redeemingCode: item.itemCode });
        try {
          await redeemPointItem(item.itemCode);
          wx.showToast({ title: '兑换成功', icon: 'success' });
          await Promise.all([this.loadAccount(), this.loadOrders()]);
          this.setData({ tab: 'orders' });
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '兑换失败', icon: 'none' });
        } finally {
          this.setData({ redeemingCode: '' });
        }
      }
    });
  }
});
