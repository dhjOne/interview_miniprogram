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
    showImagePopup: false,
    popupImageUrl: '',
    isNetworkImage: false // 标记是否为网络图片
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
    // 如果有链接，执行跳转而不是直接返回
    if (url) {
      wx.navigateTo({ url });
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

  // 显示图片弹窗
  showImagePopup() {
    console.log("点击联系客服 - 方法被调用");
    console.log("当前 showImagePopup 状态:", this.data.showImagePopup);

    const imageUrl = '/static/contact/公众号.jpg';
    const isNetworkImage = imageUrl.startsWith('http');
  
    this.setData({
      showImagePopup: true,
      popupImageUrl: imageUrl,
      isNetworkImage: isNetworkImage
    });
  
  },

  // 隐藏图片弹窗
  hideImagePopup() {
    this.setData({
      showImagePopup: false
    });
  },
  onPopupVisibleChange(e) {
    if (!e.detail.visible) {
      this.hideImagePopup();
    }
  },
  
   // 图片长按事件
  onImageLongPress() {
    console.log("图片被长按");
    // 可以在这里添加一些反馈，比如震动
    wx.vibrateShort({
      type: 'light'
    });
  },

  // 保存图片到相册
  async saveImageToPhotos() {
    const that = this;
    
    try {
      // 显示加载中
      wx.showLoading({
        title: '保存中...',
        mask: true
      });
      
      let tempFilePath = this.data.popupImageUrl;
      
      // 如果是网络图片，需要先下载
      if (this.data.isNetworkImage) {
        const downloadResult = await new Promise((resolve, reject) => {
          wx.downloadFile({
            url: this.data.popupImageUrl,
            success: resolve,
            fail: reject
          });
        });
        
        tempFilePath = downloadResult.tempFilePath;
      }
      
      // 保存到相册
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 2000
      });
      
    } catch (error) {
      wx.hideLoading();
      console.error('保存图片失败:', error);
      
      // 处理不同的错误情况
      if (error.errMsg && error.errMsg.includes('auth deny')) {
        // 用户拒绝授权，引导用户打开相册权限
        that.showAuthGuide();
      } else {
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none',
          duration: 2000
        });
      }
    }
  },
  // 显示授权引导
  showAuthGuide() {
    wx.showModal({
      title: '需要相册权限',
      content: '保存图片需要您授权访问相册，请在设置中打开相册权限',
      confirmText: '去设置',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 打开设置页面
          wx.openSetting({
            success: (settingRes) => {
              if (settingRes.authSetting['scope.writePhotosAlbum']) {
                wx.showToast({
                  title: '授权成功',
                  icon: 'success'
                });
              }
            }
          });
        }
      }
    });
  },

  // 检查相册授权状态
  checkPhotoAlbumAuth() {
    return new Promise((resolve) => {
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.writePhotosAlbum']) {
            resolve(true);
          } else {
            resolve(false);
          }
        },
        fail: () => resolve(false)
      });
    });
  },

  // 请求相册授权
  requestPhotoAlbumAuth() {
    return new Promise((resolve) => {
      wx.authorize({
        scope: 'scope.writePhotosAlbum',
        success: () => resolve(true),
        fail: () => resolve(false)
      });
    });
  },

  // 增强的保存图片方法（包含授权检查）
  async enhancedSaveImage() {
    // 检查授权状态
    const hasAuth = await this.checkPhotoAlbumAuth();
    
    if (!hasAuth) {
      // 请求授权
      const authGranted = await this.requestPhotoAlbumAuth();
      if (!authGranted) {
        this.showAuthGuide();
        return;
      }
    }
    
    // 授权通过，执行保存
    this.saveImageToPhotos();
  },
});
