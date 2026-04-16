import request from '~/api/request';
import useToastBehavior from '~/behaviors/useToast';
const app = getApp();
Page({
  behaviors: [useToastBehavior],

  data: {
    isLoad: false,
    service: [
      { name: '收藏题', icon: 'heart', type: 'favorite' },
      { name: '生疏题', icon: 'flash', type: 'weak' },
      { name: '刷题排行', icon: 'trend-chart', type: 'ranking' },
      { name: '关于我们', icon: 'info-circle', type: 'about' }
    ],
    personalInfo: {},
    gridList: [
      {
        name: '全部发布',
        icon: 'root-list',
        type: 'all',
        url: '/pages/document/index?type=all',
      },
      {
        name: '审核中',
        icon: 'search',
        type: 'progress',
        url: '/pages/document/index?type=review',
      },
      {
        name: '已发布',
        icon: 'upload',
        type: 'published',
        url: '/pages/document/index?type=published',
      },
      {
        name: '草稿箱',
        icon: 'file-copy',
        type: 'draft',
        url: '/pages/document/index?type=drafts',
      },
    ],

    settingList: [
      { 
        name: '设置', 
        icon: 'setting', 
        type: 'setting', 
        url: '/pages/setting/index' 
      }
    ]
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
    // 如果后端返回服务列表，可在这里覆盖默认服务
    // request('/repository/category').then((res) => {
    //   const { service } = res.data.data;
    //   if (service && service.length) {
    //     this.setData({ service });
    //   }
    // });
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
    console.log('调整。。。。。')
    const { url, method } = e.currentTarget.dataset.data;
    // 如果有链接，执行跳转而不是直接返回
    if (url) {
      app.navigateToLogin({
        url: url
      });
      return;
    }
    // 如果有指定方法，调用对应方法
    if (method && typeof this[method] === 'function') {
      this[method]();
    } else {
      // 默认处理
      const { name } = e.currentTarget.dataset.data;
      this.onShowToast('#t-toast', name);
    }
  },

  handleContact(e) {
    console.log('contact event', e);
  },

  // 显示图片弹窗

});
