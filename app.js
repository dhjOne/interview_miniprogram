// app.js
import createBus from './utils/eventBus';
import encryption from './utils/encryption';
import { connectSocket, fetchUnreadNum } from './utils/chatService';
import {
  buildLoginUrl,
  getCurrentPagePath,
  navigateToLogin,
  navigateToWithAuth,
} from './utils/router';
const { warmupTowxml } = require('./utils/towxmlLoader');

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

    updateManager.onCheckForUpdate(() => {
      // console.log(res.hasUpdate)
    });

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

    this.getUnreadNum();
    this.connect();
    // 初始化时检查登录状态
    this.checkLoginStatus();
    // ECDH：启动后静默预加载会话并挂续期定时器，减少业务首包再暴露交换接口
    encryption.startLifecycle();
    // 预下载 towxml 分包，供 mknow 等页异步渲染 Markdown
    warmupTowxml();

  },

  onShow() {
    encryption.syncSessionFromStorage()
    encryption.onAppShow();
  },
  globalData: {
    userInfo: null,
    unreadNum: 0, // 未读消息数量
    socket: null, // SocketTask 对象
    eventListeners: {},
    showFloatButton: true
  },

  /** 全局事件总线 */
  eventBus: createBus(),

  /** 初始化WebSocket */
  connect() {
    const socket = connectSocket();
    socket.onMessage((data) => {
      data = JSON.parse(data);
      if (data.type === 'message' && !data.data.message.read) this.setUnreadNum(this.globalData.unreadNum + 1);
    });
    this.globalData.socket = socket;
  },

  /** 获取未读消息数量 */
  getUnreadNum() {
    fetchUnreadNum().then(({ data }) => {
      this.globalData.unreadNum = data;
      this.eventBus.emit('unread-num-change', data);
    });
  },

  /** 设置未读消息数量 */
  setUnreadNum(unreadNum) {
    this.globalData.unreadNum = unreadNum;
    this.eventBus.emit('unread-num-change', unreadNum);
  },
  // 设置用户信息的方法
  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    // 同时存储到本地，防止刷新丢失
    wx.setStorageSync('user_info', userInfo);
  },
  
  // 获取用户信息的方法
  getUserInfo() {
    if (this.globalData.userInfo) {
      return this.globalData.userInfo;
    }
    // 从本地存储获取
    return wx.getStorageSync('user_info');
  },

  // 注册事件监听
  on(event, callback) {
    if (!this.globalData.eventListeners[event]) {
      this.globalData.eventListeners[event] = [];
    }
    this.globalData.eventListeners[event].push(callback);
  },
  
  // 触发事件
  emit(event, data) {
    const listeners = this.globalData.eventListeners[event];
    if (listeners) {
      listeners.forEach(callback => {
        callback(data);
      });
    }
  },
  
  // 移除事件监听
  off(event, callback) {
    const listeners = this.globalData.eventListeners[event];
    if (listeners) {
      this.globalData.eventListeners[event] = listeners.filter(cb => cb !== callback);
    }
  },

   // 检查登录状态
   checkLoginStatus() {
    const token = wx.getStorageSync('access_token');
    const userInfo = wx.getStorageSync('user_info');
    
    if (token && userInfo) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
    }
    return !!(token && userInfo);
  },

  /** 当前页完整路径（含 query），用于登录页「返回」回到进入登录前的页面，与 return（登录后要去的目标）区分 */
  getCurrentPagePath() {
    return getCurrentPagePath();
  },

  _loginUrlWithReferrer(extraQuery) {
    return buildLoginUrl(extraQuery);
  },

   // 统一跳转方法
   navigateToWithAuth(options) {
    navigateToWithAuth(options, this);
  },
  // 不检查，直接跳转登陆
  navigateToLogin(options) {
    navigateToLogin(options, this);
  },
  // 全局显示/隐藏浮动按钮
  showGlobalFloatButton() {
    this.globalData.showFloatButton = true;
    // 通知所有页面
    this.eventBus.emit('float-button-change', true);
  },
  
  hideGlobalFloatButton() {
    this.globalData.showFloatButton = false;
    this.eventBus.emit('float-button-change', false);
  }


});
