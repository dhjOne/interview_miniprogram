import { BaseParams } from './param_base'

/**
 * 登录参数
 */
export class LoginParams extends BaseParams {
  constructor(username, password, code, phone, userInfo, loginType = 'password') {
    super()
    this.username = username
    this.password = password
    this.grantType = loginType
    this.clientId = '7b2bcf3c6a3e4834a375727231a816a0'
    this.code = code
    this.phone = phone
    this.userInfo = userInfo
  }
  
  // 参数验证
  validate() {
    const errors = []
    
    // if (!this.username || this.username.trim().length === 0) {
    //   errors.push('用户名不能为空')
    // }
    
    // if (!this.password || this.password.length < 6) {
    //   errors.push('密码长度不能少于6位')
    // }

    if (!this.phone || !/^1[3-9]\d{9}$/.test(this.phone)) {
      errors.push('手机号格式不正确')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      username: this.username,
      password: this.password,
      grantType: this.grantType,
      clientId: this.clientId,
      timestamp: this.timestamp,
      deviceType: this.deviceType,
      code: this.code,
      phone: this.phone,
      userInfo: this.userInfo
    }
  }
}

/**
 * 注册参数
 */
export class RegisterParams extends BaseParams {
  constructor(username, password, phone, smsCode) {
    super()
    this.username = username
    this.password = password
    this.phone = phone
    this.smsCode = smsCode
    this.inviteCode = ''
  }
  
  validate() {
    const errors = []
    
    if (!this.username || this.username.trim().length < 3) {
      errors.push('用户名长度不能少于3位')
    }
    
    if (!this.password || this.password.length < 6) {
      errors.push('密码长度不能少于6位')
    }
    
    if (!this.phone || !/^1[3-9]\d{9}$/.test(this.phone)) {
      errors.push('手机号格式不正确')
    }
    
    if (!this.smsCode || this.smsCode.length !== 6) {
      errors.push('验证码格式不正确')
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
  toRequestData() {
    return {
      username: this.username.trim(),
      password: this.password,
      phone: this.phone,
      smsCode: this.smsCode,
      inviteCode: this.inviteCode,
      timestamp: this.timestamp,
      deviceType: this.deviceType,
      code: this.code,
      phone: this.phone
    }
  }
}

export class WxLoginParams extends BaseParams {
  constructor(code, phone) {
    super()
    this.code = code,
    this.phone = phone
  }
  
  // 转换为请求数据
  toRequestData() {
    return {
      code: this.code,
      phone: this.phone
    }
  }
}