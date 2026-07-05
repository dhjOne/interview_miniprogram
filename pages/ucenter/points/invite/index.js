import { bindInviteCode, fetchMyInviteCode } from '~/utils/points';

Page({
  data: {
    inviteCode: '',
    bindCode: '',
    binding: false,
    loading: true
  },

  onLoad() {
    this.loadInviteCode();
  },

  onPullDownRefresh() {
    return this.loadInviteCode();
  },

  async loadInviteCode() {
    this.setData({ loading: true });
    try {
      const inviteCode = await fetchMyInviteCode();
      this.setData({ inviteCode: inviteCode || '—' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onBindInput(e) {
    this.setData({ bindCode: e.detail.value || '' });
  },

  onCopyCode() {
    const code = this.data.inviteCode;
    if (!code || code === '—') return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '已复制邀请码', icon: 'success' })
    });
  },

  async onBindSubmit() {
    const code = (this.data.bindCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    this.setData({ binding: true });
    try {
      await bindInviteCode(code);
      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.setData({ bindCode: '' });
    } catch (e) {
      wx.showToast({ title: (e && e.message) || '绑定失败', icon: 'none' });
    } finally {
      this.setData({ binding: false });
    }
  }
});
