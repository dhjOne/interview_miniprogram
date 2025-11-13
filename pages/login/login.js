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
      // 创建登录参数对象
      const param = this.data.passwordInfo
      const loginParams = new LoginParams(param.username, param.password)
      // 调用API
      const result = await authApi.login(loginParams)
      console.log("登陆结果",result);
      if (result.code === "0000") {
        wx.setStorageSync('access_token', result.data.accessToken);
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
        wx.switchTab({
          url: `/pages/my/index`,
        });
      } else {
        wx.showToast({
          title: result.message || '登录失败',
          icon: 'none'
        })
      }
    } else {
      const res = await request('/login/getSendMessage', 'get');
      if (res.success) {
        wx.navigateTo({
          url: `/pages/loginCode/loginCode?phoneNumber=${this.data.phoneNumber}`,
        });
      }
    }
  },
  async wxLogin2() {
    const phoneNumber = this.data.phoneNumber; // 在回调外部先获取值
    console.log('当前手机号:', phoneNumber);
    wx.login({
      success(res) {
        if (res.code) {
          const loginParams = new LoginParams(null, null,res.code, phoneNumber, "applet")
          // 调用API
          const result = authApi.login(loginParams)
          console.log("登陆结果",result);
          if (result.code === "0000") {
            wx.setStorageSync('access_token', result.data.accessToken);
            wx.showToast({
              title: '登录成功',
              icon: 'success'
            })
            wx.switchTab({
              url: `/pages/my/index`,
            });
          } else {
            wx.showToast({
              title: result.message || '登录失败',
              icon: 'none'
            })
          }
        } else {
          console.log('登录失败！' + res.errMsg)
        }
      }
    })
  },

  async wxLogin() {
    const phoneNumber = this.data.phoneNumber;
    console.log('当前手机号:', phoneNumber);
    
    try {
      // 获取微信登录code
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });
  
      if (loginRes.code) {
        const loginParams = new LoginParams(null, null, loginRes.code, phoneNumber, "applet");
        
        // 使用 await 等待登录接口返回结果
        const result = await authApi.login(loginParams);
        console.log("登陆结果", result);
        
        if (result.code === "0000") {
          wx.setStorageSync('access_token', result.data.accessToken);
          const app = getApp();
          app.setUserInfo(result.data.userInfo); 
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          });
          wx.switchTab({
            url: `/pages/my/index`,
          });
        } else {
          wx.showToast({
            title: result.message || '登录失败',
            icon: 'none'
          });
        }
      } else {
        console.log('获取code失败！' + loginRes.errMsg);
        wx.showToast({
          title: '获取登录凭证失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('登录过程出错:', error);
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'none'
      });
    }
  },


  onLoad() {
    // 绑定方法上下文，确保this始终指向页面实例
    this.wxLogin = this.wxLogin.bind(this);
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      })
    }
  },
  getUserProfile(e) {
    // 推荐使用wx.getUserProfile获取用户信息，开发者每次通过该接口获取用户个人信息均需用户确认
    // 开发者妥善保管用户快速填写的头像昵称，避免重复弹窗
    wx.getUserProfile({
      desc: '用于完善会员资料', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
      success: (res) => {
        console.log("用户信息： ",res)
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        })
      }
    })
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
        console.log('✅ 页面跳转成功:', res)
      },
      fail: (error) => {
        console.error('❌ 页面跳转失败:', error)
      },
      complete: () => {
        console.log('📞 navigateTo调用完成')
      }
    })
  },
  updateAgreementStatus(value) {
    this.setData({
      radioValue: value
    })
  },
});

