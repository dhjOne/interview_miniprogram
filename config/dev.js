// config/dev.js
export default {
  env: 'development',
  baseUrl: 'http://localhost:9991',
  apiPrefix: '/api',
  successCode: '0000',
  timeout: 10000,
  features: {
    enableDebug: true,
    logLevel: 'debug'
  },
  encryption: {
    exchange: '/api/encryption/exchange',
    destroy_session: '/api/encryption/session',
    sessionExpiredCode: 'C111',
    useTestKeys: false
    // disabled: true  // 关闭客户端加密链路时取消注释
  }
}
