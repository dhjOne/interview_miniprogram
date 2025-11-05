// pages/agreement/agreement.js
Page({
  data: {
    isAgreed: false,
    companyName: '您的公司名称',
    productName: '您的产品/服务名称',
    servicePhone: '400-xxx-xxxx',
    serviceEmail: 'service@yourcompany.com',
    companyAddress: '您的公司地址'
  },

  onLoad(options) {
    // 可以接收参数，比如从哪个页面跳转过来
    this.setData({
      fromPage: options.from || 'login'
    })
  },

  // 复选框状态改变
  onCheckboxChange() {
    this.setData({
      isAgreed: !this.data.isAgreed
    })
  },

  // 同意协议
  onAgree() {
    if (!this.data.isAgreed) {
      wx.showToast({
        title: '请先阅读并同意协议',
        icon: 'none'
      })
      return
    }

    // 保存用户同意状态
    wx.setStorageSync('hasAgreedToTerms', true)
    wx.setStorageSync('agreementVersion', '1.0') // 协议版本号
    
    // 记录同意时间
    wx.setStorageSync('agreementAgreedTime', new Date().getTime())

    wx.showToast({
      title: '协议已同意',
      icon: 'success',
      duration: 1500,
      success: () => {
        setTimeout(() => {
          // 返回上一页或跳转到首页
          if (this.data.fromPage === 'login') {
            wx.navigateBack()
          } else {
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }, 1500)
      }
    })
  },

  // 不同意协议
  onDisagree() {
    wx.showModal({
      title: '提示',
      content: '您需要同意用户服务协议才能使用我们的服务',
      confirmText: '重新阅读',
      cancelText: '退出应用',
      success: (res) => {
        if (res.confirm) {
          // 用户点击重新阅读，不做任何操作
        } else if (res.cancel) {
          // 退出小程序
          wx.exitMiniProgram()
        }
      }
    })
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '用户服务协议',
      path: '/pages/agreement/agreement'
    }
  }
})