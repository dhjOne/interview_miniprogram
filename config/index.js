// /** 是否使用mock代替api返回 */
// export const config = {
//   useMock: true,
// };

// export default { config };
// config/index.js
// 根据编译环境动态加载配置
let config = {}

// 微信小程序环境判断
if (__wxConfig && __wxConfig.envVersion) {
  const env = __wxConfig.envVersion
  
  switch (env) {
    case 'develop':    // 开发版
      config = require('./dev.js').default
      break
    case 'trial':      // 体验版
      config = require('./test.js').default
      break
    case 'release':    // 正式版
    default:
      config = require('./prod.js').default
      break
  }
} else {
  // 开发工具中默认使用开发环境
  config = require('./dev.js').default
}

// 导出配置
export default config