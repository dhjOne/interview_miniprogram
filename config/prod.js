// config/prod.js
export default {
  env: 'production',
  baseUrl: 'https://api.example.com',
  apiPrefix: '/api/v1',
  api: {
    login: '/auth/login',
    getUserInfo: '/user/info',
    updateProfile: '/user/profile'
  },
  thirdParty: {
    mapKey: 'PROD_MAP_KEY_789',
    ossBucket: 'prod-bucket'
  },
  features: {
    enableDebug: false,
    enableMock: false,
    logLevel: 'error'
  },
  timeout: 10000
}