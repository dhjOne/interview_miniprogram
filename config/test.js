// config/test.js — 体验版（trial）
export default {
  env: 'test',
  baseUrl: 'https://test-api.example.com',
  apiPrefix: '/api/v1',
  successCode: '0000',
  timeout: 10000,
  features: {
    enableDebug: true,
    logLevel: 'info'
  },
  encryption: {
    exchange: '/encryption/exchange',
    destroy_session: '/encryption/session',
    sessionExpiredCode: 'C111',
    useTestKeys: false
  }
}
