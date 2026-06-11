// 方案1: 使用相对路径（推荐）
import config from '../config/index'
import encryption from '../utils/encryption'
console.log('🔧 request.js中加载的配置:', config) // 调试日志


/**
 * 业务错误类
 */
class BusinessError extends Error {
  constructor(code, message, data = null) {
    super(message)
    this.name = 'BusinessError'
    this.code = code
    this.data = data
    this.type = 'BUSINESS_ERROR'
  }
}

/**
 * 增强的请求工具 - 支持参数封装
 */
class Request {
  constructor() {
    this.baseUrl = config.baseUrl
    this.apiPrefix = config.apiPrefix || '/api'
    this.successCode = config.successCode || '0000' // 成功的业务码
    /** 避免并发 401 多次触发跳转登录 */
    this._unauthorizedRedirecting = false
  }

  /**
   * 是否启用客户端加密链路（ECDH 会话、X-Session-Id、密文自动解密）
   * 为 false 时仅当显式 `encryption.disabled === true`；与「后端是否加密」解耦，后端以 DB/配置为准。
   * 未禁用时始终预建会话，以便后端按库表命中加密时使用 ECDH（无会话则会退化为 RSA，小程序无法解密）。
   */
  _isEncryptionPipelineEnabled() {
    return config.encryption?.disabled !== true
  }

  /** 加密会话失效码 C111，与登录 C105 无关 */
  _getSessionExpiredCode() {
    return (config.encryption && config.encryption.sessionExpiredCode) || 'C111'
  }

  _needsEncryptionSessionRenewal(responseData, responseHeader) {
    const expiredCode = this._getSessionExpiredCode()
    const code = responseData && responseData.code != null ? String(responseData.code).trim() : ''
    if (code === expiredCode) {
      return true
    }
    const headers = responseHeader || {}
    const renewal = headers['X-Require-Session-Renewal'] || headers['x-require-session-renewal']
    return renewal === 'true' || renewal === true
  }

  _wxRequestRaw(wxOptions) {
    return new Promise((resolve, reject) => {
      wx.request({
        ...wxOptions,
        success: (res) => resolve(res),
        fail: (err) => reject(new BusinessError(-1, (err && err.errMsg) || '网络请求失败'))
      })
    })
  }

  /**
   * 发送请求
   * @param {Object} options 请求选项
   * @param {string} options.url 请求地址
   * @param {string} options.method 请求方法
   * @param {BaseParams} options.params 参数对象
   * @param {Object} options.header 请求头
   * @param {boolean} options.showLoading 是否显示加载提示
   * @param {string} options.loadingText 加载提示文字
   * @param {boolean} options.encrypt 兼容保留，无实际作用（是否加密由服务端配置决定，客户端按响应体自动解密）
   * @param {boolean} options.checkBusinessCode 是否检查业务状态码
   */
  async request(options, internal = {}) {
    const {
      url,
      method = 'GET',
      params = null,
      data = null,
      header = {},
      showLoading = options.showLoading !== false,
      loadingText = options.loadingText || '加载中...',
      checkBusinessCode = true
    } = options

    const retryCount = internal.retryCount || 0
    const cryptoOn = this._isEncryptionPipelineEnabled()

    if (cryptoOn) {
      encryption.syncSessionFromStorage()
      try {
        await encryption.ensureSession({ silent: true })
      } catch (e) {
        console.warn('[ECDH] 预建会话失败，将在 C111 时自动重建:', (e && e.message) || e)
      }
    }

    if (showLoading) {
      wx.showLoading({ title: loadingText, mask: true })
    }

    try {
      let requestData = data
      if (params && typeof params.toRequestData === 'function') {
        const validation = params.validate ? params.validate() : { isValid: true, errors: [] }
        if (!validation.isValid) {
          const errText = (validation.errors || [])
            .map((item) => (typeof item === 'string' ? item : (item && item.message) || '参数错误'))
            .join(', ')
          throw new BusinessError(400, errText || '参数校验失败')
        }
        requestData = filterEmptyFields(params.toRequestData())
      }
      if ((requestData == null) && params && typeof params === 'object' && typeof params.toRequestData !== 'function') {
        requestData = filterEmptyFields(params)
      }
      if (requestData && typeof requestData === 'object') {
        requestData = filterEmptyFields(requestData)
      }

      const fullUrl = this._buildUrl(url)
      const requestHeader = {
        'Content-Type': 'application/json',
        'Authorization': this._getToken(),
        ...header
      }
      if (cryptoOn && encryption.sessionId) {
        requestHeader['X-Session-Id'] = encryption.sessionId
      }

      console.group(`🌐 网络请求: ${method} ${url}`)
      console.log('请求参数:', requestData)
      console.log('完整URL:', fullUrl)

      const res = await this._wxRequestRaw({
        url: fullUrl,
        method: method.toUpperCase(),
        data: requestData,
        header: requestHeader,
        timeout: config.timeout || 10000
      })

      console.log('响应数据:', res)
      console.groupEnd()

      if (res.statusCode !== 200) {
        throw this._handleHttpError(res)
      }

      let responseData = res.data

      // C111：加密会话失效 → 静默 re-exchange + 重试（不跳登录）
      if (cryptoOn && this._needsEncryptionSessionRenewal(responseData, res.header)) {
        if (retryCount >= 1) {
          throw new BusinessError(this._getSessionExpiredCode(), '加密会话重建后仍失败，请稍后重试')
        }
        console.warn('[ECDH] 收到 C111，静默重建会话并重试:', url)
        await encryption.renewSession()
        return this.request({ ...options, showLoading: false }, { retryCount: retryCount + 1 })
      }

      const secureEnvelope = encryption.pickSecureEnvelope(responseData)
      if (secureEnvelope) {
        if (!cryptoOn) {
          throw new BusinessError(-3, '收到加密响应但已关闭加密链路')
        }
        if (secureEnvelope.encryptedAesKey && secureEnvelope.encryptedIv) {
          throw new BusinessError(-3, '响应为 RSA 加密，请先完成 ECDH 密钥交换')
        }
        console.log('🔐 检测到加密响应，开始解密...')
        try {
          responseData = await encryption.decryptResponse(secureEnvelope)
        } catch (decryptError) {
          console.error('❌ 响应解密失败:', decryptError)
          if (retryCount < 1) {
            console.warn('[ECDH] 解密失败，重建会话并重试:', url)
            await encryption.renewSession()
            return this.request({ ...options, showLoading: false }, { retryCount: retryCount + 1 })
          }
          throw new BusinessError(-3, '响应解密失败，请重试')
        }
      }

      if (checkBusinessCode && !this._isBusinessSuccess(responseData)) {
        throw this._handleBusinessError(responseData)
      }

      if (cryptoOn && encryption.sessionId) {
        encryption.touchSession()
      }

      console.log('请求成功')
      return responseData
    } catch (error) {
      try { console.groupEnd() } catch (ignored) { /* noop */ }
      if (error instanceof BusinessError) throw error
      if (error instanceof Error) throw new BusinessError(-1, error.message || '请求失败')
      throw new BusinessError(-1, '请求失败，请稍后重试')
    } finally {
      if (showLoading) wx.hideLoading()
    }
  }

  // 构建完整URL
  _buildUrl(url) {
    if (url.startsWith('http')) {
      return url
    }
    
    const base = this.baseUrl.endsWith('/') 
      ? this.baseUrl.slice(0, -1) 
      : this.baseUrl
    
    const prefix = this.apiPrefix.startsWith('/') 
      ? this.apiPrefix 
      : `/${this.apiPrefix || ''}`
    
    const path = url.startsWith('/') ? url : `/${url}`
    
    return `${base}${prefix}${path}`
  }

  // 获取token
  _getToken() {
    try {
      const token = wx.getStorageSync('access_token')
      console.log('access_token:::::', token)
      return token ? `Bearer ${token}` : ''
    } catch (error) {
      return ''
    }
  }

  // 判断业务是否成功
  _isBusinessSuccess(responseData) {
    return (
      responseData &&
      typeof responseData === 'object' &&
      !Array.isArray(responseData) &&
      responseData.code === this.successCode
    )
  }

  // 处理HTTP错误
  _handleHttpError(response) {
    const { statusCode, data } = response
    
    switch(statusCode) {
      case 400:
        return new BusinessError(400, data?.message || '请求参数错误')
      case 401:
        // token过期，可以在这里触发重新登录
        this._handleUnauthorized()
        return new BusinessError(401, data?.message || '未授权，请重新登录')
      case 403:
        return new BusinessError(403, data?.message || '权限不足')
      case 404:
        return new BusinessError(404, data?.message || '接口不存在')
      case 500:
        return new BusinessError(500, data?.message || '服务器内部错误')
      case 502:
        return new BusinessError(502, data?.message || '网关错误')
      case 503:
        return new BusinessError(503, data?.message || '服务不可用')
      default:
        return new BusinessError(statusCode, data?.message || `请求失败: ${statusCode}`)
    }
  }

  // 处理业务错误
  _handleBusinessError(responseData) {
    if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
      return new BusinessError('UNKNOWN', '响应格式异常')
    }
    const code = responseData.code != null ? String(responseData.code).trim() : 'UNKNOWN'
    const message = responseData.message || '请求失败'
    const data = responseData.data

    if (code === 'C105') {
      this._handleUnauthorized()
    } else if (code === this._getSessionExpiredCode()) {
      console.warn('[ECDH] C111 重试仍失败，不跳登录')
    }

    return new BusinessError(code, message, data)
  }

  // 处理网络错误
  _handleNetworkError(error) {
    if (error.errMsg && error.errMsg.includes('request:fail')) {
      if (error.errMsg.includes('timeout')) {
        return new BusinessError(-2, '请求超时，请检查网络连接')
      } else {
        return new BusinessError(-1, '网络连接失败，请检查网络设置')
      }
    }
    
    return new BusinessError(-1, '未知网络错误', error)
  }

  // 处理未授权（token过期）
  _handleUnauthorized() {
    if (this._unauthorizedRedirecting) return
    this._unauthorizedRedirecting = true
    console.log("处理未授权（token过期）")
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
    } catch (error) {
      console.error('清除登录态失败:', error)
    }

    try {
      const app = getApp()
      if (app && app.globalData) {
        app.globalData.userInfo = null
        app.globalData.token = null
      }
    } catch (e) {
      // ignore
    }

    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    let returnUrl = ''

    if (currentPage) {
      const route = currentPage.route
      const options = currentPage.options || {}
      const params = Object.keys(options)
        .map((key) => `${key}=${options[key]}`)
        .join('&')
      returnUrl = `/${route}${params ? '?' + params : ''}`

      try {
        wx.setStorageSync('return_url', returnUrl)
      } catch (error) {
        console.error('存储返回URL失败:', error)
      }
    }

    let referrerQ = ''
    try {
      const app = getApp()
      const ref =
        app && typeof app.getCurrentPagePath === 'function'
          ? app.getCurrentPagePath()
          : returnUrl
      if (ref) {
        referrerQ = '&referrer=' + encodeURIComponent(ref)
        try {
          wx.setStorageSync('login_referrer', ref)
        } catch (err) {
          // ignore
        }
      }
    } catch (e) {
      if (returnUrl) {
        referrerQ = '&referrer=' + encodeURIComponent(returnUrl)
        try {
          wx.setStorageSync('login_referrer', returnUrl)
        } catch (err) {
          // ignore
        }
      }
    }

    const loginUrl = `/pages/login/login?from=token_expired${referrerQ}${
      returnUrl ? '&return=' + encodeURIComponent(returnUrl) : ''
    }`
    wx.redirectTo({
      url: loginUrl,
      fail: () => {
        this._unauthorizedRedirecting = false
        wx.reLaunch({ url: loginUrl })
      }
    })
  }


  // 快捷方法 - 支持参数对象
  get(url, params = null, options = {}) {
    return this.request({ 
      url, 
      method: 'GET', 
      params,
      ...options 
    })
  }

  post(url, params = null, options = {}) {
    return this.request({ 
      url, 
      method: 'POST', 
      params,
      ...options 
    })
  }

  put(url, params = null, options = {}) {
    return this.request({ 
      url, 
      method: 'PUT', 
      params,
      ...options 
    })
  }

  delete(url, params = null, options = {}) {
    return this.request({ 
      url, 
      method: 'DELETE', 
      params,
      ...options 
    })
  }

  // 通用请求（直接使用完整 options）
  requestDirect(options = {}) {
    return this.request(options)
  }

  // 上传文件
  upload(filePath, params = null, formData = {}, options = {}) {
    return new Promise((resolve, reject) => {
      // 构建请求数据
      let requestData = formData
      if (params && typeof params.toRequestData === 'function') {
        const validation = params.validate ? params.validate() : { isValid: true, errors: [] }
        if (!validation.isValid) {
          return reject({
            code: 400,
            message: validation.errors.join(', '),
            type: 'PARAMS_VALIDATION_ERROR'
          })
        }
        requestData = { ...requestData, ...params.toRequestData() }
      }
      
      wx.uploadFile({
        url: this._buildUrl(options.url || '/upload'),
        filePath: filePath,
        name: 'file',
        formData: requestData,
        header: {
          'Authorization': this._getToken()
        },
        success: (res) => {
          const data = JSON.parse(res.data)
          // 检查HTTP状态码
          if (res.statusCode !== 200) {
            reject(this._handleHttpError(res))
            return
          }
          
          // 检查业务状态码
          if (options.checkBusinessCode !== false && !this._isBusinessSuccess(data)) {
            reject(this._handleBusinessError(data))
            return
          }
          resolve(data)
        },
        fail: (error) => {
          reject(this._handleError(error))
        }
      })
    })
  }
}

// 创建单例实例
const http = new Request()
export default http

// /**
//  * 基础请求参数类型
//  */
// export class BaseParams {
//   constructor() {
//     this.timestamp = Date.now()
//     this.deviceType = 'mini-program'
//     this.version = '1.0.0'
//   }
// }

// /**
//  * 分页参数
//  */
// export class PaginationParams {
//   constructor(page = 1, size = 10) {
//     this.page = page
//     this.size = size
//   }
  
//   toQuery() {
//     return {
//       page: this.page,
//       size: this.size
//     }
//   }
// }

// /**
//  * 排序参数
//  */
// export class SortParams {
//   constructor(field = 'createTime', order = 'desc') {
//     this.field = field
//     this.order = order
//   }
  
//   toQuery() {
//     return {
//       sortField: this.field,
//       sortOrder: this.order
//     }
//   }
// }

/**
 * 判断值是否为空
 * @param {*} value 要判断的值
 * @returns {boolean} 是否为空
 */
function isEmptyValue(value) {
  return value === null || 
         value === undefined || 
         value === '' || 
         (Array.isArray(value) && value.length === 0) ||
         (typeof value === 'object' && Object.keys(value).length === 0)
}

/**
 * 过滤空值字段
 * @param {Object} obj 要过滤的对象
 * @returns {Object} 过滤后的对象
 */
function filterEmptyFields(obj) {
  if (!obj || typeof obj !== 'object') return obj
  
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!isEmptyValue(value)) {
      result[key] = value
    }
  }
  return result
}