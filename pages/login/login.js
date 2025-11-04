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
      clientId: '195da9fcce574852b850068771cde034',
      grantType: 'password'
    },
    radioValue: '',
    userInfo: {},
    hasUserInfo: false,
    canIUseGetUserProfile: false,
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
  async wxLogin() {
    console.log("微信登陆.....")
    wx.login({
      success (res) {
        console.log("weixin code", res)
        if (res.code) {
          //发起网络请求
          // 调用API

          const wxloginParams = new WxLoginParams(res.code)
          console.log("weixin code", wx)
          const result = authApi.wxlogin(wxloginParams)
          console.log('一件登陆：',result)
        } else {
          console.log('登录失败！' + res.errMsg)
        }
      }
    })
  },


  onLoad() {
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
  getUserInfo(e) {
    // 不推荐使用getUserInfo获取用户信息，预计自2021年4月13日起，getUserInfo将不再弹出弹窗，并直接返回匿名的用户个人信息
    this.setData({
      userInfo: e.detail.userInfo,
      hasUserInfo: true
    })
  },
});

