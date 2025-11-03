// config/test.js
export default {
  env: 'test',
  baseUrl: 'https://test-api.example.com',
  apiPrefix: '/api/v1',
  api: {
    login: '/auth/login',
    getUserInfo: '/user/info',
    updateProfile: '/user/profile'
  },
  thirdParty: {
    mapKey: 'TEST_MAP_KEY_456',
    ossBucket: 'test-bucket'
  },
  features: {
    enableDebug: true,
    enableMock: false,
    logLevel: 'info'
  },
  timeout: 10000
}