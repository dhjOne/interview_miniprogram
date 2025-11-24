import { authApi } from '~/api/request/api_login';
import { LoginParams } from '~/api/param/param_login'
import { WxLoginParams } from '~/api/param/param_login'

Page({
  data: {
    phoneNumber: '',
    isPhoneNumber: false,
    isCheck: false,
    isSubmit: false,
    isPasswordLogin: false,
    passwordInfo: {
      username: '',
      password: '',
      clientId: '7b2bcf3c6a3e4834a375727231a816a0',
      grantType: 'applet'
    },
    radioValue: '',
    userInfo: {},
    hasUserInfo: false,
    canIUseGetUserProfile: true,
    wxLoginCode: '', // 存储 wx.login 的 code
    isGettingUserInfo: false, // 是否正在获取用户信息
    from: '', // 来源页面标识
    returnUrl: '' // 返回页面路径
  },

  onLoad(options) {
    console.log('登录页面参数:', options);
    
    // 绑定方法上下文，确保this始终指向页面实例
    // this.wxLogin = this.wxLogin.bind(this);
    
    // 设置页面数据
    this.setData({
      from: options.from || '',
      returnUrl: options.return || ''
    });
    
    // 如果没有通过参数传递returnUrl，尝试从storage获取
    if (!this.data.returnUrl) {
      try {
        const storedReturnUrl = wx.getStorageSync('return_url');
        if (storedReturnUrl) {
          this.setData({ returnUrl: storedReturnUrl });
          console.log('从storage获取返回URL:', storedReturnUrl);
        }
      } catch (error) {
        console.error('获取存储的返回URL失败:', error);
      }
    }
    
    // 检查微信getUserProfile能力
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
    
    console.log('登录页面初始化完成:', {
      from: this.data.from,
      returnUrl: this.data.returnUrl
    });
  },

  /* 自定义功能函数 */
  changeSubmit() {
    if (this.data.isPasswordLogin) {
      if (this.data.passwordInfo.username !== '' && this.data.passwordInfo.password !== '' && this.data.isCheck) {
        this.setData({ isSubmit: true });
      } else {
        this.setData({ isSubmit: false });
      }
    } else if (this.data.isPhoneNumber && this.data.isCheck) {
      this.setData({ isSubmit: true });
    } else {
      this.setData({ isSubmit: false });
    }
  },

  // 手机号变更
  onPhoneInput(e) {
    const isPhoneNumber = /^[1][3,4,5,7,8,9][0-9]{9}$/.test(e.detail.value);
    this.setData({
      isPhoneNumber,
      phoneNumber: e.detail.value,
    });
    this.changeSubmit();
  },

  // 用户协议选择变更
  onCheckChange(e) {
    const { value } = e.detail;
    this.setData({
      radioValue: value,
      isCheck: value === 'agree',
    });
    this.changeSubmit();
  },

  onAccountChange(e) {
    this.setData({ passwordInfo: { ...this.data.passwordInfo, username: e.detail.value } });
    this.changeSubmit();
  },

  onPasswordChange(e) {
    this.setData({ passwordInfo: { ...this.data.passwordInfo, password: e.detail.value } });
    this.changeSubmit();
  },

  // 切换登录方式
  changeLogin() {
    this.setData({ isPasswordLogin: !this.data.isPasswordLogin, isSubmit: false });
  },

  async login() {
    if (this.data.isPasswordLogin) {
      await this.passwordLogin();
    } else {
      await this.prepareWxLogin();
    }
  },

  // 密码登录
  async passwordLogin() {
    // 创建登录参数对象
    const param = this.data.passwordInfo;
    const loginParams = new LoginParams(param.username, param.password);
    
    try {
      // 调用API
      const result = await authApi.login(loginParams);
      console.log("密码登录结果", result);
      
      if (result.code === "0000") {
        wx.setStorageSync('access_token', result.data.accessToken);
        const token = wx.getStorageSync('access_token')
         console.log('login:::::', token)
        // 登录成功后的跳转处理
        await this.handleLoginSuccess(result);
      } else {
        wx.showToast({
          title: result.message || '登录失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('密码登录失败:', error);
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'none'
      });
    }
  },

  // 处理登录成功后的跳转
  async handleLoginSuccess(result) {
    try {
      console.log(" this.data", this.data)
      const { from, returnUrl } = this.data;
      console.log(" from, returnUrl", from, returnUrl)
      // 清除存储的返回URL
      // try {
      //   wx.removeStorageSync('return_url');
      // } catch (error) {
      //   console.error('清除返回URL失败:', error);
      // }
      
      // 设置用户信息到全局
      const app = getApp();
      if (result.data.userInfo) {
        app.setUserInfo(result.data.userInfo);
      }
      const token = wx.getStorageSync('access_token')
     console.log('login22:::::', token)
      
      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 1500
      });
      
      // 延迟跳转，确保Toast显示完整
      setTimeout(() => {
        if (returnUrl && (from === 'token_expired' || from === 'unauthorized')) {
          console.log('🔙 登录成功，返回原页面:', returnUrl);
          
          // 使用 redirectTo 返回原页面
          const decodedUrl = decodeURIComponent(returnUrl);
          console.log('解码后的URL:', decodedUrl);
          wx.redirectTo({
            url: decodedUrl
          });
        } else {
          // 默认跳转到我的页面
          wx.switchTab({
            url: '/pages/my/index'
          });
        }
      }, 300);
      
    } catch (error) {
      console.error('登录成功处理失败:', error);
      // 失败时跳转到首页
      wx.switchTab({
        url: '/pages/my/index'
      });
    }
  },

  getPhoneNumber (e) {
    console.log(e.detail.code)  // 动态令牌
    console.log(e.detail.errMsg) // 回调信息（成功失败都会返回）
    console.log(e.detail.errno)  // 错误码（失败时返回）
  },

  // 查看协议
  viewUserAgreement() {
    wx.navigateTo({
      url: '/pages/agreement/agreement?from=login',
      success: (res) => {
        console.log('✅ 页面跳转成功:', res);
      },
      fail: (error) => {
        console.error('❌ 页面跳转失败:', error);
      },
      complete: () => {
        console.log('📞 navigateTo调用完成');
      }
    });
  },

  updateAgreementStatus(value) {
    this.setData({
      radioValue: value
    });
  },

  // 准备微信登录：获取 code
  async prepareWxLogin() {
    const phoneNumber = this.data.phoneNumber; // 在回调外部先获取值
    console.log('当前手机号:', phoneNumber);
    
    if (!this.data.isPhoneNumber) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      });
      return;
    }

    if (!this.data.isCheck) {
      wx.showToast({
        title: '请同意用户协议',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({
        title: '准备登录...',
      });

      // 先获取微信登录 code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });
      
      if (!loginRes.code) {
        throw new Error('获取登录凭证失败');
      }
      
      // 保存 code，准备获取用户信息
      this.setData({
        wxLoginCode: loginRes.code,
        isGettingUserInfo: true
      });

      wx.hideLoading();
      
      // 提示用户授权
      wx.showModal({
        title: '授权提示',
        content: '需要获取您的头像和昵称来完善资料',
        confirmText: '去授权',
        cancelText: '暂不',
        success: (res) => {
          if (res.confirm) {
            // 用户点击确定，触发获取用户信息
            this.getUserProfileForLogin();
          } else {
            // 用户取消，直接使用 code 登录
            this.doLoginWithCode(this.data.wxLoginCode, null);
          }
        }
      });
    
    } catch (error) {
      console.error('准备登录失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '登录准备失败，请重试',
        icon: 'none'
      });
    }
  },

  // 专门用于登录的获取用户信息方法
  getUserProfileForLogin() {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        console.log("用户信息： ", res);
        const userInfo = res.userInfo;
        
        this.setData({
          userInfo: userInfo,
          hasUserInfo: true
        });
        
        // 使用之前保存的 code 和用户信息进行登录
        this.doLoginWithCode(this.data.wxLoginCode, userInfo);
      },
      fail: (err) => {
        console.log("用户拒绝授权:", err);
        // 用户拒绝授权，仍然使用 code 登录
        this.doLoginWithCode(this.data.wxLoginCode, null);
      }
    });
  },

  // 使用 code 和用户信息执行登录
  async doLoginWithCode(code, userInfo) {
    if (!code) {
      wx.showToast({
        title: '登录凭证失效，请重试',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({
        title: '登录中...',
      });

      const loginParams = new LoginParams(null, null, code, this.data.phoneNumber, null, "applet");
      
      // 如果有用户信息，可以在这里处理或传递给后端
      if (userInfo) {
        console.log('获取到用户信息:', userInfo);
        loginParams.userInfo = userInfo;
      }
      
      const result = await authApi.login(loginParams);
      console.log("微信登录结果", result);
      
      if (result.code === "0000") {
        wx.setStorageSync('access_token', result.data.accessToken);
        const token = wx.getStorageSync('access_token')
         console.log('login:::::', token)
        // 登录成功后的统一处理
        await this.handleLoginSuccess(result);
      } else {
        wx.showToast({
          title: result.message || '登录失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('微信登录过程出错:', error);
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
      this.setData({ isGettingUserInfo: false });
    }
  },

  // 返回上一页（可选功能）
  goBack() {
    const { from, returnUrl } = this.data;
    
    if (returnUrl && (from === 'token_expired' || from === 'unauthorized')) {
      // 如果有返回URL，跳转回去
      wx.redirectTo({
        url: returnUrl
      });
    } else {
      // 否则返回上一页或首页
      wx.navigateBack({
        delta: 1
      });
    }
  }
});