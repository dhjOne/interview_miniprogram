import config from '../config/index';

console.log('🔧 request.js中加载的配置:', config)

// const { configs } = config;
const baseUrl = config.baseUrl 
const apiPrefix = config.apiPrefix
const urls = baseUrl + apiPrefix
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
  return new Promise((resolve, reject) => {
    console.log("测试url ",urls + url);
    wx.request({
      url: urls + url,
      method,
      data,
      dataType: 'json', // 微信官方文档中介绍会对数据进行一次JSON.parse
      header,
      success(res) {
        setTimeout(() => {
          // HTTP状态码为200才视为成功
          if (res.code === 200) {
            resolve(res);
          } else {
            // wx.request的特性，只要有响应就会走success回调，所以在这里判断状态，非200的均视为请求失败
            reject(res);
          }
        }, delay);
      },
      fail(err) {
        setTimeout(() => {
          // 断网、服务器挂了都会fail回调，直接reject即可
          reject(err);
        }, delay);
      },
    });
  });
}

// 导出请求和服务地址
export default request;
