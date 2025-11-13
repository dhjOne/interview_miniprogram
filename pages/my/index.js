import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';

Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    service: [],
    personalInfo: {},
    gridList: [
      {
        name: '全部发布',
        icon: 'root-list',
        type: 'all',
        url: '',
      },
      {
        name: '审核中',
        icon: 'search',
        type: 'progress',
        url: '',
      },
      {
        name: '已发布',
        icon: 'upload',
        type: 'published',
        url: '',
      },
      {
        name: '草稿箱',
        icon: 'file-copy',
        type: 'draft',
        url: '',
      },
    ],

    settingList: [
      { 
        name: '联系客服', 
        icon: 'service', 
        type: 'service',
        method: 'showImagePopup'
      },
      { 
        name: '设置', 
        icon: 'setting', 
        type: 'setting', 
        url: '/pages/setting/index' 
      },
    ],
    showImagePopup: true,
    popupImageUrl: '/static/gongzhonghao.png'
  },

  onLoad() {
    this.getServiceList();
  },

  async onShow() {
    const Token = wx.getStorageSync('access_token');
    if (Token) {
      // 先从全局获取用户信息
      const app = getApp();
      let personalInfo = app.getUserInfo();
      
      // 如果全局没有，再调用接口
      if (!personalInfo) {
        personalInfo = await this.getPersonalInfo();
      } 
      this.setData({
        isLoad: true,
        personalInfo,
      });
    }
  },

  getServiceList() {
    request('/api/getServiceList').then((res) => {
      const { service } = res.data.data;
      this.setData({ service });
    });
  },

  async getPersonalInfo() {
    const info = await request('/genPersonalInfo').then((res) => res.data.data);
    return info;
  },

  onLogin(e) {
    wx.navigateTo({
      url: '/pages/login/login',
    });
  },

  onNavigateTo() {
    wx.navigateTo({ url: `/pages/my/info-edit/index` });
  },

  onEleClick(e) {
    const { url, method } = e.currentTarget.dataset.data;
    // 如果有链接，直接跳转
    if (url) return;
    // 如果有指定方法，调用对应方法
    if (method && typeof this[method] === 'function') {
      this[method]();
    } else {
      // 默认处理
      const { name } = e.currentTarget.dataset.data;
      this.onShowToast('#t-toast', name);
    }
  },

  // 显示图片弹窗
  showImagePopup() {
    console.log("dianji");
    this.setData({
      showImagePopup: true,
      popupImageUrl: 'https://tdesign.gtimg.com/mobile/demos/example1.png' // 先用TDesign的示例图片
    });
  },

  // 隐藏图片弹窗
  hideImagePopup() {
    this.setData({
      showImagePopup: false
    });
  },
});
