import {
  fetchBusinessCooperation,
  submitBusinessLead
} from '~/utils/business';

Page({
  data: {
    loading: true,
    submitting: false,
    submitted: false,
    /** form | contact */
    activeTab: 'form',
    title: '',
    desc: '',
    email: '',
    wechat: '',
    qrcodeUrl: '',
    types: [],
    isOtherType: false,
    isEnterprise: true,
    form: {
      partnerType: 'ENTERPRISE',
      cooperationType: '',
      cooperationTypeCustom: '',
      companyName: '',
      contactName: '',
      phone: '',
      wechat: '',
      email: '',
      requirement: ''
    }
  },

  onLoad() {
    this.loadCooperation();
  },

  onPullDownRefresh() {
    return this.loadCooperation();
  },

  async loadCooperation() {
    this.setData({ loading: true });
    try {
      const info = await fetchBusinessCooperation();
      const types = info.types || [];
      const currentType = this.data.form.cooperationType;
      const nextType =
        currentType && types.includes(currentType)
          ? currentType
          : types[0] || '';
      this.setData({
        title: info.title,
        desc: info.desc,
        email: info.email,
        wechat: info.wechat,
        qrcodeUrl: info.qrcodeUrl,
        types,
        'form.cooperationType': nextType,
        isOtherType: nextType === '其他'
      });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
  },

  onSelectPartnerType(e) {
    const partnerType = e.currentTarget.dataset.type;
    if (!partnerType) return;
    this.setData({
      'form.partnerType': partnerType,
      isEnterprise: partnerType === 'ENTERPRISE'
    });
  },

  onSelectType(e) {
    const type = e.currentTarget.dataset.type;
    if (!type) return;
    this.setData({
      'form.cooperationType': type,
      isOtherType: type === '其他',
      'form.cooperationTypeCustom': type === '其他' ? this.data.form.cooperationTypeCustom : ''
    });
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    const value = e.detail && e.detail.value != null ? e.detail.value : '';
    this.setData({ [`form.${field}`]: value });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await submitBusinessLead(this.data.form);
      const firstType = (this.data.types && this.data.types[0]) || '';
      this.setData({
        submitted: true,
        isOtherType: firstType === '其他',
        isEnterprise: true,
        form: {
          partnerType: 'ENTERPRISE',
          cooperationType: firstType,
          cooperationTypeCustom: '',
          companyName: '',
          contactName: '',
          phone: '',
          wechat: '',
          email: '',
          requirement: ''
        }
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
    } catch (e) {
      const msg =
        (e && e.message) ||
        (e && e.msg) ||
        (e && e.data && e.data.message) ||
        '提交失败，请稍后重试';
      wx.showToast({
        title: String(msg).slice(0, 40),
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onContinueSubmit() {
    this.setData({ submitted: false, activeTab: 'form' });
  },

  onGoContact() {
    this.setData({ activeTab: 'contact', submitted: false });
  },

  onCopyEmail() {
    const email = (this.data.email || '').trim();
    if (!email) {
      wx.showToast({ title: '暂无邮箱', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: email,
      success: () => wx.showToast({ title: '已复制邮箱', icon: 'success' })
    });
  },

  onCopyWechat() {
    const wechat = (this.data.wechat || '').trim();
    if (!wechat) {
      wx.showToast({ title: '暂无微信号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: wechat,
      success: () => wx.showToast({ title: '已复制微信号', icon: 'success' })
    });
  },

  onPreviewQrcode() {
    const url = (this.data.qrcodeUrl || '').trim();
    if (!url) return;
    wx.previewImage({
      current: url,
      urls: [url]
    });
  },

  onSaveQrcode() {
    const url = (this.data.qrcodeUrl || '').trim();
    if (!url) {
      wx.showToast({ title: '暂无二维码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中', mask: true });
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
          return;
        }
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => {
            wx.hideLoading();
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail: (err) => {
            wx.hideLoading();
            if (err && /auth deny|authorize/i.test(String(err.errMsg || ''))) {
              wx.showModal({
                title: '需要相册权限',
                content: '请在设置中允许保存到相册后重试',
                confirmText: '去设置',
                success: (modalRes) => {
                  if (modalRes.confirm) wx.openSetting();
                }
              });
              return;
            }
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    });
  }
});
