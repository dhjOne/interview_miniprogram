// config/prod.js — 正式版（release）
export default {
  env: 'production',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/api/v1',
  successCode: '0000',
  timeout: 10000,
  features: {
    enableDebug: false,
    logLevel: 'error'
  },
  encryption: {
    exchange: '/encryption/exchange',
    destroy_session: '/encryption/session',
    sessionExpiredCode: 'C111',
    useTestKeys: false
  }
}
