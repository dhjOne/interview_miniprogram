import config from '../config/index';

console.log('🔧 request.js中加载的配置:', config)

// const { configs } = config;
const baseUrl = config.baseUrl 
const apiPrefix = config.apiPrefix
const delay = config.isMock ? 500 : 0;
function request(url, method = 'GET', data = {}) {
  const header = {
    'content-type': 'application/json',
    // 有其他content-type需求加点逻辑判断处理即可
  };
  // 获取token，有就丢进请求头
  const tokenString = wx.getStorageSync('access_token');
  if (tokenString) {
    header.Authorization = `Bearer ${tokenString}`;
  }
  // 显示加载提示
  wx.showLoading({
    title: "请求中....",
    mask: true
  })
  // 构建完整URL
  const fullUrl = _buildUrl(url)
  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data,
      dataType: 'json', // 微信官方文档中介绍会对数据进行一次JSON.parse
      header,
      timeout: config.timeout || 10000,
      success: (res) => {
        console.log('响应数据:', res)
        console.groupEnd()
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          res.success = false
          reject(_handleError(res))
        }
      },
      fail: (error) => {
        console.error('请求失败:', error)
        console.groupEnd()
        error.success = false
        reject(_handleError(error))
      },
      complete: () => {
        if (true) {
          wx.hideLoading()
        }
      }
    });
  });
}
function _buildUrl(url) {
    if (url.startsWith('http')) {
      return url
    }
    
    const base = baseUrl.endsWith('/') 
      ? baseUrl.slice(0, -1) 
      : baseUrl
    
    const prefix = apiPrefix.startsWith('/') 
      ? apiPrefix 
      : `/${apiPrefix || ''}`
    
    const path = url.startsWith('/') ? url : `/${url}`
    
    return `${base}${prefix}${path}`
  }

  // 获取token
function _getToken() {
    try {
      const token = wx.getStorageSync('access_token')
      return token ? `Bearer ${token}` : ''
    } catch (error) {
      return ''
    }
  }

  // 错误处理
function  _handleError(error) {
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

// 导出请求和服务地址
export default request;
