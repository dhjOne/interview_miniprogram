// 方案1: 使用相对路径（推荐）
import config from '../config/index'
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
   */
  async request(options) {
    const { 
      url, 
      method = 'GET', 
      params = null,
      data = null,
      header = {},
      showLoading = true,
      loadingText = '加载中...',
      checkBusinessCode = true // 新增：是否检查业务状态码
    } = options
    
    // 显示加载提示
    if (showLoading) {
      wx.showLoading({
        title: loadingText,
        mask: true
      })
    }
    
    // 构建请求数据
    let requestData = data
    if (params && typeof params.toRequestData === 'function') {
      // 验证参数
      const validation = params.validate ? params.validate() : { isValid: true, errors: [] }
      if (!validation.isValid) {
        wx.hideLoading()
        return Promise.reject({
          code: 400,
          message: validation.errors.join(', '),
          type: 'PARAMS_VALIDATION_ERROR'
        })
      }
      // 转换参数并过滤空值
      const rawData = params.toRequestData()
      requestData = filterEmptyFields(rawData)
    }

    // 如果直接传入的data也要过滤空值
    if (requestData && typeof requestData === 'object') {
      requestData = filterEmptyFields(requestData)
    }
    
    // 构建完整URL
    const fullUrl = this._buildUrl(url)
    
    console.group(`🌐 网络请求: ${method} ${url}`)
    console.log('请求参数:', requestData)
    console.log('完整URL:', fullUrl)
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: fullUrl,
        method: method.toUpperCase(),
        data: requestData,
        header: {
          'Content-Type': 'application/json',
          'Authorization': this._getToken(),
          ...header
        },
        timeout: config.timeout || 10000,
        success: (res) => {
          console.log('响应数据:', res)
          console.groupEnd()
          
          // 统一处理HTTP状态码异常
          if (res.statusCode !== 200) {
            const error = this._handleHttpError(res)
            reject(error)
            return
          }
          // 统一处理业务状态码异常
          if (checkBusinessCode && !this._isBusinessSuccess(res.data)) {
            const error = this._handleBusinessError(res.data)
            reject(error)
            return
          }
          // 请求成功
          resolve(res.data)
        },
        fail: (error) => {
          console.error('请求失败:', error)
          console.groupEnd()
          reject(this._handleNetworkError(error))
        },
        complete: () => {
          if (showLoading) {
            wx.hideLoading()
          }
        }
      })
    })
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
    // 根据你的业务返回结构判断
    // 这里假设返回结构为 { code: '0000', data: ..., message: ... }
    return responseData && responseData.code === this.successCode
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
    const { code, message, data } = responseData
    
    // 可以根据不同的业务错误码进行特殊处理
    switch(code) {
      case '1001': // 示例：token过期
        this._handleUnauthorized()
        break
      case '1002': // 示例：权限不足
        // 特殊处理逻辑
        break
      default:
        // 默认处理
        break
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
    // 清除token
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
    } catch (error) {
      console.error('清除token失败:', error)
    }
    
    // 可以在这里触发全局的重新登录逻辑
    // 例如：跳转到登录页面
    setTimeout(() => {
      wx.showModal({
        title: '提示',
        content: '登录已过期，请重新登录',
        showCancel: false,
        success: (res) => {
          if (res.confirm) {
            // 跳转到登录页
            wx.reLaunch({
              url: '/pages/login/login'
            })
          }
        }
      })
    }, 500)
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