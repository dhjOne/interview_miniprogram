// 方案1: 使用相对路径（推荐）
import config from '../config/index'
console.log('🔧 request.js中加载的配置:', config) // 调试日志
/**
 * 增强的请求工具 - 支持参数封装
 */
class Request {
  constructor() {
    this.baseUrl = config.baseUrl
    this.apiPrefix = config.apiPrefix || '/api'
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
      loadingText = '加载中...'
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
      
      requestData = params.toRequestData()
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
          
          if (res.statusCode === 200) {
            resolve(res.data)
          } else {
            reject(this._handleError(res))
          }
        },
        fail: (error) => {
          console.error('请求失败:', error)
          console.groupEnd()
          reject(this._handleError(error))
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
      const token = wx.getStorageSync('token')
      return token ? `Bearer ${token}` : ''
    } catch (error) {
      return ''
    }
  }

  // 错误处理
  _handleError(error) {
    if (error.errMsg && error.errMsg.includes('request:fail')) {
      return {
        code: -1,
        message: '网络连接失败，请检查网络设置',
        type: 'NETWORK_ERROR'
      }
    }
    
    if (error.statusCode) {
      switch(error.statusCode) {
        case 400:
          return {
            code: 400,
            message: '请求参数错误',
            type: 'BAD_REQUEST'
          }
        case 401:
          return {
            code: 401,
            message: '未授权，请重新登录',
            type: 'UNAUTHORIZED'
          }
        case 403:
          return {
            code: 403,
            message: '权限不足',
            type: 'FORBIDDEN'
          }
        case 404:
          return {
            code: 404,
            message: '接口不存在',
            type: 'NOT_FOUND'
          }
        case 500:
          return {
            code: 500,
            message: '服务器内部错误',
            type: 'SERVER_ERROR'
          }
        default:
          return {
            code: error.statusCode,
            message: `请求失败: ${error.statusCode}`,
            type: 'HTTP_ERROR'
          }
      }
    }
    
    return {
      code: -1,
      message: '未知错误',
      type: 'UNKNOWN_ERROR',
      detail: error
    }
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

/**
 * 基础请求参数类型
 */
export class BaseParams {
  constructor() {
    this.timestamp = Date.now()
    this.deviceType = 'mini-program'
    this.version = '1.0.0'
  }
}

/**
 * 分页参数
 */
export class PaginationParams {
  constructor(page = 1, size = 10) {
    this.page = page
    this.size = size
  }
  
  toQuery() {
    return {
      page: this.page,
      size: this.size
    }
  }
}

/**
 * 排序参数
 */
export class SortParams {
  constructor(field = 'createTime', order = 'desc') {
    this.field = field
    this.order = order
  }
  
  toQuery() {
    return {
      sortField: this.field,
      sortOrder: this.order
    }
  }
}