import config from '../config/index'
import encryption from '../utils/encryption'

const enableDebug = !!(config.features && config.features.enableDebug)

function debugLog(...args) {
  if (enableDebug) console.log(...args)
}

function debugGroup(label) {
  if (enableDebug && console.group) console.group(label)
}

function debugGroupEnd() {
  if (enableDebug && console.groupEnd) {
    try { console.groupEnd() } catch (e) { /* noop */ }
  }
}

/**
 * 业务错误类
 */
export class BusinessError extends Error {
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
    this.successCode = config.successCode || '0000'
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

      debugGroup(`🌐 网络请求: ${method} ${url}`)
      debugLog('请求参数:', requestData)
      debugLog('完整URL:', fullUrl)

      const res = await this._wxRequestRaw({
        url: fullUrl,
        method: method.toUpperCase(),
        data: requestData,
        header: requestHeader,
        timeout: config.timeout || 10000
      })

      debugLog('响应数据:', res)
      debugGroupEnd()

      const statusCode = Number(res.statusCode)
      if (statusCode !== 200) {
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
        debugLog('🔐 检测到加密响应，开始解密...')
        try {
          responseData = await encryption.decryptResponse(secureEnvelope)
        } catch (decryptError) {
          console.error('[request] 响应解密失败:', decryptError)
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

      debugLog('请求成功')
      return responseData
    } catch (error) {
      debugGroupEnd()
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
    const statusCode = Number(response.statusCode)
    const data = response.data
    const bizCode = data && data.code != null ? String(data.code).trim() : ''

    // 后端登录过期：HTTP 401 + body.code=C105（也可能仅有其一）
    if (statusCode === 401 || bizCode === 'C105') {
      this._handleUnauthorized(data?.message)
      return new BusinessError(401, data?.message || '未授权，请重新登录')
    }

    switch (statusCode) {
      case 400:
        return new BusinessError(400, data?.message || '请求参数错误')
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
      this._handleUnauthorized(message)
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
      } 
        return new BusinessError(-1, '网络连接失败，请检查网络设置')
      
    }
    
    return new BusinessError(-1, '未知网络错误', error)
  }

  /** 登录成功后调用，允许下次 token 过期再次跳转 */
  clearUnauthorizedLock() {
    this._unauthorizedRedirecting = false
  }

  // 处理未授权（token过期）
  _handleUnauthorized(message) {
    if (this._unauthorizedRedirecting) return
    this._unauthorizedRedirecting = true
    debugLog('处理未授权（token过期）')

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
    const currentRoute = currentPage && currentPage.route ? String(currentPage.route) : ''

    // 已在登录页时不要再跳，避免死循环；解锁以便登录成功后可再次拦截
    if (currentRoute.includes('pages/login/login')) {
      this._unauthorizedRedirecting = false
      return
    }

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
        wx.setStorageSync('login_referrer', returnUrl)
      } catch (error) {
        console.error('存储返回URL失败:', error)
      }
    }

    // 过长 URL 会导致 navigate 失败；referrer/return 已写入 storage，query 只带必要参数
    const loginUrl = `/pages/login/login?from=token_expired${
      returnUrl ? '&return=' + encodeURIComponent(returnUrl) : ''
    }`

    const tip = message || '登录已过期，请重新登录'
    try {
      wx.showToast({ title: tip, icon: 'none', duration: 2000 })
    } catch (e) {
      // ignore
    }

    const goLogin = () => {
      wx.reLaunch({
        url: loginUrl,
        success: () => {
          // 进入登录页后解锁，避免登录成功后再过期时无法跳转
          this._unauthorizedRedirecting = false
        },
        fail: (err) => {
          console.error('跳转登录页失败:', err)
          this._unauthorizedRedirecting = false
          wx.redirectTo({
            url: loginUrl,
            complete: () => {
              this._unauthorizedRedirecting = false
            }
          })
        }
      })
    }

    // 稍延后跳转，避免与页面 catch 里的 toast 抢态
    setTimeout(goLogin, 100)

    // 兜底：若跳转异常卡住，数秒后解锁
    setTimeout(() => {
      this._unauthorizedRedirecting = false
    }, 5000)
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
      let requestData = formData
      if (params && typeof params.toRequestData === 'function') {
        const validation = params.validate ? params.validate() : { isValid: true, errors: [] }
        if (!validation.isValid) {
          const errText = (validation.errors || []).join(', ')
          reject(new BusinessError(400, errText || '参数校验失败'))
          return
        }
        requestData = { ...requestData, ...params.toRequestData() }
      }

      const header = {
        Authorization: this._getToken(),
        ...(options.header || {})
      }
      if (this._isEncryptionPipelineEnabled() && encryption.sessionId) {
        header['X-Session-Id'] = encryption.sessionId
      }

      wx.uploadFile({
        url: this._buildUrl(options.url || '/upload'),
        filePath: filePath,
        name: options.name || 'file',
        formData: requestData,
        header,
        success: (res) => {
          let data
          try {
            data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
          } catch (e) {
            reject(new BusinessError(-1, '上传响应解析失败'))
            return
          }
          if (res.statusCode !== 200) {
            reject(this._handleHttpError({ ...res, data }))
            return
          }
          if (options.checkBusinessCode !== false && !this._isBusinessSuccess(data)) {
            reject(this._handleBusinessError(data))
            return
          }
          resolve(data)
        },
        fail: (error) => {
          reject(this._handleNetworkError(error))
        }
      })
    })
  }
}

const http = new Request()
export default http

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
  Object.entries(obj).forEach(([key, value]) => {
    if (!isEmptyValue(value)) {
      result[key] = value
    }
  })
  return result
}