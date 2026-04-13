import { authApi } from '~/api/request/api_login';
import { LoginParams } from '~/api/param/param_login'
import { WxLoginParams } from '~/api/param/param_login'

/** 与 app.json tabBar 一致，用于 switchTab / 非 Tab 用 reLaunch */
const LOGIN_TAB_ROOTS = [
  '/pages/home/index',
  '/pages/category/index',
  '/pages/message/index',
  '/pages/my/index',
  '/pages/release/index'
];

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
    returnUrl: '', // 登录成功后要去的页面（目标）
    referrerUrl: '' // 进入登录前所在页，用于左上角「返回」
  },

  onLoad(options) {
    let referrerUrl = options.referrer || '';
    if (referrerUrl && referrerUrl.includes('%')) {
      try {
        referrerUrl = decodeURIComponent(referrerUrl);
      } catch (e) {
        // 保持原值
      }
    }
    if (referrerUrl) {
      try {
        wx.removeStorageSync('login_referrer');
      } catch (e) {
        // ignore
      }
    } else {
      try {
        const storedRef = wx.getStorageSync('login_referrer');
        if (storedRef) {
          referrerUrl = storedRef;
          wx.removeStorageSync('login_referrer');
        }
      } catch (e) {
        // ignore
      }
    }

    this.setData({
      from: options.from || '',
      returnUrl: options.return || '',
      referrerUrl
    });

    if (!this.data.returnUrl) {
      try {
        const storedReturnUrl = wx.getStorageSync('return_url');
        if (storedReturnUrl) {
          this.setData({ returnUrl: storedReturnUrl });
        }
      } catch (error) {
        console.error('获取存储的返回URL失败:', error);
      }
    }

    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
  },

  onShow() {
    try {
      if (wx.getStorageSync('login_sync_agreement')) {
        wx.removeStorageSync('login_sync_agreement');
        this.updateAgreementStatus('agree');
      }
    } catch (e) {
      // ignore
    }
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
    this.setData(
      { isPasswordLogin: !this.data.isPasswordLogin, isSubmit: false },
      () => this.changeSubmit()
    );
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
      const { from, returnUrl } = this.data;
      try {
        wx.removeStorageSync('login_referrer');
      } catch (e) {
        // ignore
      }

      const app = getApp();
      if (result.data.userInfo) {
        app.setUserInfo(result.data.userInfo);
      }

      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 1500
      });

      setTimeout(() => {
        if (returnUrl && (from === 'token_expired' || from === 'unauthorized')) {
          let decodedUrl = returnUrl;
          if (decodedUrl.includes('%')) {
            try {
              decodedUrl = decodeURIComponent(decodedUrl);
            } catch (e) {
              // 保持原值
            }
          }
          let openUrl = decodedUrl.trim();
          if (!openUrl.startsWith('/')) {
            openUrl = `/${openUrl}`;
          }
          const base = openUrl.split('?')[0];
          if (LOGIN_TAB_ROOTS.includes(base)) {
            wx.switchTab({ url: base });
          } else {
            // 先关掉登录页再 navigateTo 目标页，栈为「来源页 → 发布管理」，原生导航为返回，不会出现「小房子」
            wx.navigateBack({
              delta: 1,
              success: () => {
                wx.navigateTo({
                  url: openUrl,
                  fail: () => {
                    wx.redirectTo({
                      url: openUrl,
                      fail: () => wx.reLaunch({ url: openUrl })
                    });
                  }
                });
              },
              fail: () => {
                wx.redirectTo({
                  url: openUrl,
                  fail: () => wx.reLaunch({ url: openUrl })
                });
              }
            });
          }
        } else {
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

  /** 协议页同意后回调：需同步 radio + isCheck，否则返回登录页仍显示未勾选且无法提交 */
  updateAgreementStatus(value) {
    const agreed = value === 'agree';
    this.setData(
      {
        radioValue: agreed ? 'agree' : '',
        isCheck: agreed
      },
      () => this.changeSubmit()
    );
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
      this.doLoginWithCode(this.data.wxLoginCode, null);
      // 提示用户授权
      // wx.showModal({
      //   title: '授权提示',
      //   content: '需要获取您的头像和昵称来完善资料',
      //   confirmText: '去授权',
      //   cancelText: '暂不',
      //   success: (res) => {
      //     if (res.confirm) {
      //       // 用户点击确定，触发获取用户信息
      //       this.getUserProfileForLogin();
      //     } else {
      //       // 用户取消，直接使用 code 登录
      //       this.doLoginWithCode(this.data.wxLoginCode, null);
      //     }
      //   }
      // });
    
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

  // 返回：优先 referrer（进入登录前所在页）；非 Tab 用 reLaunch，避免 redirectTo 先露出栈里下一层页面
  goBack() {
    const { referrerUrl, from, returnUrl: rawReturn } = this.data;
    let returnUrl = rawReturn || '';
    if (returnUrl && returnUrl.includes('%')) {
      try {
        returnUrl = decodeURIComponent(returnUrl);
      } catch (e) {
        // 保持原值
      }
    }

    const openPath = (path) => {
      if (!path || !String(path).trim()) return false;
      const clean = String(path).trim();
      const base = clean.split('?')[0];
      console.log('base:', base)
      if (LOGIN_TAB_ROOTS.includes(base)) {
        // 从分包登录页 switchTab 时，运行时可能先经过 app.json 里 pages 靠前的 Tab，易闪「题库」；优先 reLaunch 直达目标 Tab
        wx.reLaunch({
          url: base,
          fail: () => {
            wx.switchTab({
              url: base,
              fail: () => this._loginGoBackLastResort()
            });
          }
        });
        return true;
      }
      wx.reLaunch({
        url: clean,
        fail: () => {
          wx.redirectTo({
            url: clean,
            fail: () => {
              wx.navigateTo({
                url: clean,
                fail: () => this._loginGoBackLastResort()
              });
            }
          });
        }
      });
      return true;
    };

    if (referrerUrl) {
      console.log('执行这个： ',referrerUrl)
      openPath(referrerUrl);
      return;
    }

    wx.navigateBack({
      delta: 1,
      fail: () => {
        if (returnUrl && (from === 'token_expired' || from === 'unauthorized')) {
          openPath(returnUrl);
        } else {
          this._loginGoBackLastResort();
        }
      }
    });
  },

  _loginGoBackLastResort() {
    wx.switchTab({
      url: '/pages/home/index'
    });
  }
});