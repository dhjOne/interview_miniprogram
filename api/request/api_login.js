// api/auth.js
import http from '../api_request'

export const authApi = {
  // 登录
  login: (loginParams) => http.post('/auth/login', loginParams, {
      showLoading: true,
      loadingText: '登录中...'
    }),
  
   // 微信登录
   wxlogin: (wxLoginParams) => http.post('/wechat/mini/user/login', wxLoginParams, {
      showLoading: true,
      loadingText: '登录中...'
    }),

  // 注册
  register: (registerParams) => http.post('/auth/register', registerParams, {
      showLoading: true,
      loadingText: '注册中...'
    }),
  
  // 退出登录
  logout: () => http.post('/auth/logout', null, {
      showLoading: false
    }),
  
  // 获取用户信息
  getUserInfo: () => http.get('/auth/userinfo', null, {
      showLoading: false
    })
}