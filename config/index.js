// config/index.js — 按微信小程序编译环境加载配置
let config = {}

if (typeof __wxConfig !== 'undefined' && __wxConfig && __wxConfig.envVersion) {
  switch (__wxConfig.envVersion) {
    case 'develop':
      config = require('./dev.js').default
      break
    case 'trial':
      config = require('./test.js').default
      break
    case 'release':
    default:
      config = require('./prod.js').default
      break
  }
} else {
  config = require('./dev.js').default
}

if (config.features && config.features.enableDebug) {
  console.log('[config]', config.env, config.baseUrl, config.apiPrefix)
}

export default config
