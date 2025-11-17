// config/dev.js
export default {
  // 环境标识
  env: 'develop',
  
  // API 基础配置
  // baseUrl: 'http://localhost:9991',
  baseUrl: 'https://175vq12004jn.vicp.fun',
  apiPrefix: '/api',
  
  // 业务接口
  api: {
    login: '/auth/login',
    getUserInfo: '/user/info',
    updateProfile: '/user/profile'
  },
  
  // 第三方服务配置
  thirdParty: {
    mapKey: 'DEV_MAP_KEY_123',
    ossBucket: 'dev-bucket'
  },
  
  // 功能开关
  features: {
    enableDebug: false,
    enableMock: false,
    logLevel: 'debug'
  },
  
  // 超时配置
  timeout: 15000
}