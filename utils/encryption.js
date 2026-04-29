// utils/encryption.js
// ECDH 加密管理器
//
// 注意：小程序环境下的椭圆曲线库随机数生成问题
// 当前使用预定义测试密钥对来绕过随机数生成问题
// 生产环境建议：
// 1. 使用后端生成的密钥对
// 2. 或实现安全的随机数生成器
// 3. 或使用不同的加密库
//
// 要切换到生产模式，调用: ecdhManager.setTestMode(false)

const EC = require('../lib/elliptic.min.js');
const CryptoJS = require('../lib/crypto-js.min.js');
const storage = require('./storage.js');
const config = require('../config/index');

const randomBytes = function(size) {
  const array = new Uint8Array(size);

  if (typeof wx !== 'undefined' && wx.getRandomValues) {
    try {
      const randomArray = new Uint8Array(size);
      wx.getRandomValues(randomArray);
      return randomArray;
    } catch (e) {
      console.warn('wx.getRandomValues 不可用:', e.message);
    }
  }

  const crypto = globalThis.crypto || globalThis.msCrypto;
  if (crypto && crypto.getRandomValues) {
    try {
      crypto.getRandomValues(array);
      return array;
    } catch (e) {
      console.warn('crypto.getRandomValues 不可用:', e.message);
    }
  }

  try {
    const seed = Date.now() + Math.random() * 1000000 + (typeof performance !== 'undefined' ? performance.now() : 0);
    let hash = CryptoJS.SHA256(seed.toString()).toString();

    for (let i = 0; i < size; i++) {
      const byteIndex = (i * 2) % 64;
      array[i] = parseInt(hash.substr(byteIndex, 2), 16);
    }

    hash = CryptoJS.SHA256(hash + Date.now().toString()).toString();
    for (let i = 0; i < Math.min(size, 32); i++) {
      const byteIndex = (i * 2) % 64;
      array[i] = (array[i] + parseInt(hash.substr(byteIndex, 2), 16)) % 256;
    }

    return array;
  } catch (e) {
    console.error('所有随机数生成方法都失败了:', e);
    for (let i = 0; i < size; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }
};

try {
  if (EC.utils && EC.utils.rand !== undefined) {
    EC.utils.rand = randomBytes;
  }

  if (EC.ec && EC.ec.prototype) {
    EC.ec.prototype.rand = randomBytes;
  }

  if (typeof window !== 'undefined' && window.elliptic) {
    window.elliptic.rand = randomBytes;
  }

  if (EC.rand) {
    EC.rand = randomBytes;
  }

  try {
    global.brorand = randomBytes;
    globalThis.brorand = randomBytes;

    if (typeof require !== 'undefined') {
      const Module = require('module');
      if (Module && Module._cache) {
        for (const key in Module._cache) {
          if (key.includes('brorand') || key.includes('elliptic')) {
            try {
              Module._cache[key].exports.rand = randomBytes;
              Module._cache[key].exports.default = randomBytes;
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('brorand 替换失败:', e.message);
  }
} catch (e) {
  console.warn('随机数生成器配置失败:', e);
}

class ECDHManager {
  constructor() {
    this.ec = new EC.ec('p256');
    this.sessionId = null;
    this.sharedKeyHex = null;
    this.clientKeyPair = null;
    this.useTestKeys = true;
    this.restoreSession();
  }

  restoreSession() {
    const session = storage.loadSession();
    if (session) {
      this.sessionId = session.sessionId;
      this.sharedKeyHex = session.sharedKeyHex;
      console.log('✅ 会话已恢复:', this.sessionId);
    }
  }

  generateClientKeyPair() {
    try {
      console.log('🔐 开始生成客户端密钥对...');

      if (this.useTestKeys) {
        console.log('🧪 使用预定义测试密钥对');
        const testPrivateKey = 'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721';
        this.clientKeyPair = this.ec.keyFromPrivate(testPrivateKey, 'hex');
        console.log('✅ 使用预定义私钥生成密钥对成功');
      } else {
        this.clientKeyPair = this.ec.genKeyPair();
        console.log('✅ 动态生成密钥对成功');
      }

      const pubKeyHex = this.clientKeyPair.getPublic(true, 'hex');
      console.log('✅ 客户端密钥对生成成功');
      return pubKeyHex;
    } catch (error) {
      console.error('❌ 密钥对生成失败:', error);
      throw new Error('密钥对生成失败: ' + error.message);
    }
  }

  async exchangeKeys() {
    try {
      wx.showLoading({ title: '初始化加密...', mask: true });
      const clientPublicKeyHex = this.generateClientKeyPair();
      const clientPublicKeyBase64 = this.hexToBase64(clientPublicKeyHex);

      const res = await this.wxRequest({
        url: config.ENCRYPTION.EXCHANGE,
        method: 'POST',
        data: {
          clientPublicKey: clientPublicKeyBase64
        }
      });

      if (res.code === '0000') {
        this.sessionId = res.data.sessionId;
        const serverPublicKeyBase64 = res.data.serverPublicKey;
        await this.deriveSharedKey(serverPublicKeyBase64);
        storage.saveSession({
          sessionId: this.sessionId,
          sharedKeyHex: this.sharedKeyHex
        });
        wx.hideLoading();
        wx.showToast({
          title: '加密连接已建立',
          icon: 'success',
          duration: 1500
        });
        console.log('✅ 密钥交换成功, sessionId:', this.sessionId);
        return true;
      } else {
        throw new Error('密钥交换失败: ' + res.message);
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 密钥交换失败:', error);
      wx.showToast({
        title: '加密初始化失败',
        icon: 'none'
      });
      throw error;
    }
  }

  async deriveSharedKey(serverPublicKeyBase64) {
    try {
      const serverPublicKeyHex = this.base64ToHex(serverPublicKeyBase64);
      const serverPublicKey = this.ec.keyFromPublic(serverPublicKeyHex, 'hex');
      const sharedSecret = this.clientKeyPair.derive(serverPublicKey.pub);
      const sharedSecretHex = sharedSecret.toString(16).padStart(64, '0');
      const sha256Hash = CryptoJS.SHA256(CryptoJS.enc.Hex.parse(sharedSecretHex)).toString();
      this.sharedKeyHex = sha256Hash;
      console.log('✅ 共享密钥计算完成');
    } catch (error) {
      console.error('❌ 共享密钥计算失败:', error);
      throw error;
    }
  }

  async decryptResponse(encryptedResponse) {
    if (!this.sharedKeyHex) {
      throw new Error('共享密钥未初始化，请先执行密钥交换');
    }

    try {
      const { encryptedData, timestamp } = encryptedResponse;
      const now = Date.now();
      if (now - timestamp > 300000) {
        throw new Error('响应已过期');
      }

      const combinedArrayBuffer = wx.base64ToArrayBuffer(encryptedData);
      const combinedBytes = new Uint8Array(combinedArrayBuffer);
      const iv = combinedBytes.slice(0, 12);
      const ciphertext = combinedBytes.slice(12);
      const keyWordArray = CryptoJS.enc.Hex.parse(this.sharedKeyHex);
      const ivWordArray = CryptoJS.enc.Hex.parse(this.arrayBufferToHex(iv));
      const ciphertextWordArray = CryptoJS.enc.Hex.parse(this.arrayBufferToHex(ciphertext));
      const decrypted = CryptoJS.AES.decrypt(
        { ciphertext: ciphertextWordArray },
        keyWordArray,
        {
          iv: ivWordArray,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }
      );
      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      if (!decryptedText) {
        throw new Error('解密结果为空，可能是密钥不匹配');
      }
      const jsonData = JSON.parse(decryptedText);
      console.log('✅ 响应解密成功');
      return jsonData;
    } catch (error) {
      console.error('❌ 响应解密失败:', error);
      if (error.message.includes('密钥') || error.message.includes('解密')) {
        this.clearSession();
      }
      throw error;
    }
  }

  async encryptedRequest(options) {
    const { url, method = 'GET', data = {}, needDecrypt = true } = options;
    if (needDecrypt && !this.isSessionValid()) {
      console.log('🔄 会话无效，执行密钥交换...');
      await this.exchangeKeys();
    }

    const header = {
      'Content-Type': 'application/json',
      ...options.header
    };

    if (needDecrypt && this.sessionId) {
      header['X-Session-Id'] = this.sessionId;
    }

    const res = await this.wxRequest({
      url,
      method,
      header,
      data
    });

    if (needDecrypt && res.data?.encryptedData) {
      console.log('🔐 检测到加密响应，开始解密...');
      const decryptedData = await this.decryptResponse(res.data);
      res.data = decryptedData;
    }

    return res;
  }

  wxRequest(options) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${config.baseUrl}${options.url}`,
        method: options.method || 'GET',
        header: options.header || {},
        data: options.data || {},
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.errMsg}`));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  }

  clearSession() {
    this.sessionId = null;
    this.sharedKeyHex = null;
    this.clientKeyPair = null;
    storage.clearSession();
    console.log('🗑️ 会话已清除');
  }

  isSessionValid() {
    return this.sessionId !== null && this.sharedKeyHex !== null;
  }

  setTestMode(useTest) {
    this.useTestKeys = !!useTest;
    console.log(`🔧 测试模式已${this.useTestKeys ? '启用' : '禁用'}`);
  }

  isTestMode() {
    return this.useTestKeys;
  }

  hexToBase64(hex) {
    const typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16)));
    return wx.arrayBufferToBase64(typedArray.buffer);
  }

  base64ToHex(base64) {
    const buffer = wx.base64ToArrayBuffer(base64);
    return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  arrayBufferToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

const ecdhManager = new ECDHManager();
module.exports = ecdhManager;
