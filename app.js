// app.js
import config from './config';
import Mock from './mock/index';
import createBus from './utils/eventBus';
import { connectSocket, fetchUnreadNum } from './mock/chat';

if (config.isMock) {
  Mock();
}

App({
  onLaunch() {

    const updateManager = wx.getUpdateManager();

    updateManager.onCheckForUpdate((res) => {
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

   // 统一跳转方法
   navigateToWithAuth(options) {
    const { url, success, fail, complete } = options;
    
    // 先检查登录状态
    if (!this.checkLoginStatus()) {

      wx.showModal({
        title: '提示',
        content: '登录已过期，请重新登录',
        showCancel: false,
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            // 跳转到登录页，携带来源信息
            wx.redirectTo({
              url: `/pages/login/login?from=token_expired${url ? '&return=' + encodeURIComponent(url) : ''}`
            })
          }
        }
      })

      // // 跳转到登录页
      // wx.navigateTo({
      //   url: `/pages/login/index?redirectUrl=${encodeURIComponent(url)}`,
      //   success: () => {
      //     // 可以在登录页设置回调，登录成功后自动跳转
      //   }
      // });
      return;
    }
    
    // 已登录，正常跳转
    wx.navigateTo(options);
  },
  // 不检查，直接跳转登陆
  navigateToLogin(options) {
    const { url, success, fail, complete } = options;
    if (!this.checkLoginStatus()) {
      // 跳转到登录页，携带来源信息
      wx.redirectTo({
        url: `/pages/login/login?from=token_expired${url ? '&return=' + encodeURIComponent(url) : ''}`
      })
    }
    return;
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
