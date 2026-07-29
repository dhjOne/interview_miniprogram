// app.js
import createBus, { AppEvents } from './utils/eventBus';
import encryption from './utils/encryption';
import {
  buildLoginUrl,
  getCurrentPagePath,
  navigateToLogin,
  navigateToWithAuth,
} from './utils/router';

const nativePage = Page;
Page = function withPullDownRefreshGuard(options = {}) {
  const pageOptions = options || {};
  const originPullDownRefresh = pageOptions.onPullDownRefresh;

  pageOptions.onPullDownRefresh = async function guardedPullDownRefresh(...args) {
    try {
      if (typeof originPullDownRefresh === 'function') {
        await originPullDownRefresh.apply(this, args);
      }
    } finally {
      wx.stopPullDownRefresh();
    }
  };

  return nativePage(pageOptions);
};

App({
  onLaunch() {
    const updateManager = wx.getUpdateManager();

    updateManager.onCheckForUpdate(() => {});

    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        },
      });
    });

    // 初始化时检查登录状态
    this.checkLoginStatus();
    // ECDH：启动后静默预加载会话并挂续期定时器（错开首页首包，见 encryption.startLifecycle）
    encryption.startLifecycle();
    // towxml 按需加载：进入详情 / m知道时再拉取，避免与题库首屏抢带宽
  },

  onShow() {
    encryption.syncSessionFromStorage();
    encryption.onAppShow();
  },

  globalData: {
    userInfo: null,
    showFloatButton: true,
  },

  /** 全局事件总线（唯一入口） */
  eventBus: createBus(),

  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    wx.setStorageSync('user_info', userInfo);
  },

  getUserInfo() {
    if (this.globalData.userInfo) {
      return this.globalData.userInfo;
    }
    return wx.getStorageSync('user_info');
  },

  checkLoginStatus() {
    const token = wx.getStorageSync('access_token');
    const userInfo = wx.getStorageSync('user_info');

    if (token && userInfo) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    }
    return !!(token && userInfo);
  },

  getCurrentPagePath() {
    return getCurrentPagePath();
  },

  _loginUrlWithReferrer(extraQuery) {
    return buildLoginUrl(extraQuery);
  },

  navigateToWithAuth(options) {
    navigateToWithAuth(options, this);
  },

  navigateToLogin(options) {
    navigateToLogin(options, this);
  },

  showGlobalFloatButton() {
    this.globalData.showFloatButton = true;
    this.eventBus.emit(AppEvents.FLOAT_BUTTON_CHANGE, true);
  },

  hideGlobalFloatButton() {
    this.globalData.showFloatButton = false;
    this.eventBus.emit(AppEvents.FLOAT_BUTTON_CHANGE, false);
  },
});
