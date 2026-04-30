// utils/encryption.js
const CryptoJS = require('../lib/crypto-js.min.js');
// 使用 lib 内联拷贝：微信小程序无法可靠解析 @noble/ciphers 子路径（需构建 npm 且仍可能失败）
const { gcm } = require('../lib/noble-ciphers/aes.js');
const { hexToBytes, bytesToUtf8 } = require('../lib/noble-ciphers/utils.js');
const storage = require('./storage.js');
const config = require('../config/index.js').default;
const EC = require('../lib/elliptic.min.js');

// 为椭圆曲线库配置小程序环境的随机数生成器
function randomBytes(size) {
  var array = new Uint8Array(size);
  var seed = Date.now() + Math.random() * 1000000;
  var hash = CryptoJS.SHA256(seed.toString()).toString();

  for (var i = 0; i < size; i++) {
    var byteIndex = i % 32;
    array[i] = parseInt(hash.substr(byteIndex * 2, 2), 16);
  }

  return array;
}

// 配置椭圆曲线库使用自定义随机数生成器
EC.utils.rand = randomBytes;


class ECDHManager {
  constructor() {
    this.ec = new EC.ec('p256'); // secp256r1 曲线
    this.sessionId = null;
    this.sharedKeyHex = null; // AES-256 密钥（hex格式）
    this.clientKeyPair = null;
    this.useTestKeys = true; // 开发模式下使用预定义密钥对
    // 从本地存储恢复会话
    this.restoreSession();
  }

  /**
   * 从本地存储恢复会话
   */
  restoreSession() {
    const session = storage.loadSession();
    if (session) {
      this.sessionId = session.sessionId;
      this.sharedKeyHex = session.sharedKeyHex;
      console.log('✅ 会话已恢复:', this.sessionId);
    }
  }

  /**
   * 生成客户端 ECDH 密钥对
   */
  generateClientKeyPair() { 
    try {
      console.log('🔐 开始生成客户端密钥对...');
      if (this.useTestKeys) {
        // 开发模式：使用预定义的测试密钥对
        const testPrivateKey = 'c9afa9d845ba75166b5c215767b1d6934e50c3db36e89b127b8a622b120f6721';
        this.clientKeyPair = this.ec.keyFromPrivate(testPrivateKey, 'hex');
      } else {
        // 生产模式：正常生成密钥对
        this.clientKeyPair = this.ec.genKeyPair();
      }
      // 导出公钥为 X.509 标准格式
      const pubKeyPoint = this.clientKeyPair.getPublic();
      const pubKeyHex = pubKeyPoint.encode('hex', false); // 未压缩格式（65 字节）
      
      // 构建 X.509 格式的公钥（动态拼接）
      const x509PubKeyHex = this.buildX509PublicKey(pubKeyHex);
      
      console.log('✅ 客户端密钥对生成成功');
      console.log('📝 公钥格式: X.509 标准格式');
      console.log('📏 公钥长度:', x509PubKeyHex.length / 2, '字节');
      return x509PubKeyHex;
    } catch (error) {
      console.error('❌ 密钥对生成失败:', error);
      throw new Error('密钥对生成失败: ' + error.message);
    }
  }

  /**
   * 构建 X.509 格式的公钥
   * @param {string} pubKeyHex - 椭圆曲线公钥点（hex 格式）
   * @returns {string} X.509 格式的公钥（hex 格式）
   */
  buildX509PublicKey(pubKeyHex) {
    // secp256r1 (P-256) 曲线的 OID
    // OID: 1.2.840.10045.3.1.7
    // DER 编码：06 08 2a 86 48 ce 3d 03 01 07
    const curveOID = '06082a8648ce3d030107';
    
    // EC 公钥算法 OID
    // OID: 1.2.840.10045.2.1
    // DER 编码：06 07 2a 86 48 ce 3d 02 01
    const ecAlgorithmOID = '06072a8648ce3d0201';
    
    // 构建 AlgorithmIdentifier SEQUENCE
    // 30 13 表示 SEQUENCE，长度 19 字节
    const algorithmIdentifier = '3013' + ecAlgorithmOID + curveOID;
    
    // 构建 BIT STRING
    // 03 42 表示 BIT STRING，长度 66 字节（1 字节填充 + 65 字节公钥）
    // 00 表示无填充位
    const bitStringHeader = '034200';
    const bitString = bitStringHeader + pubKeyHex;
    
    // 构建完整的 X.509 SubjectPublicKeyInfo
    // 30 59 表示 SEQUENCE，长度 89 字节
    const x509Header = '3059';
    
    return x509Header + algorithmIdentifier + bitString;
  }

  /**
   * 执行密钥交换
   */
  async exchangeKeys() {
    try {
      wx.showLoading({ title: '初始化加密...', mask: true });
      
      // Step 1: 生成密钥对
      const clientPublicKeyHex = this.generateClientKeyPair();
      
      // Step 2: 转换为 Base64（后端需要 Base64 格式）
      const clientPublicKeyBase64 = this.hexToBase64(clientPublicKeyHex);
      console.log('config.encryption::::',config.encryption)
      console.log('config.encryption.exchange::::',config.encryption.exchange)
      // Step 3: 调用服务器密钥交换接口
      const res = await this.wxRequest({
        url: config.encryption ? config.encryption.exchange : '/api/encryption/exchange',
        method: 'POST',
        data: {
          clientPublicKey: clientPublicKeyBase64
        }
      });

      if (res.code === '0000') {
        this.sessionId = res.data.sessionId;
        const serverPublicKeyBase64 = res.data.serverPublicKey;
        
        // Step 4: 计算共享密钥
        await this.deriveSharedKey(serverPublicKeyBase64);
        
        // Step 5: 保存到本地存储
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

  /**
   * 从服务端公钥（可能是 X.509 SPKI DER、或原始未压缩点）解析出 elliptic 可用的 hex
   * @param {string} base64 - Base64 编码
   * @returns {string} 未压缩点 hex（130 字符）或压缩点 hex（66 字符）
   */
  parseServerPublicKeyToPointHex(base64) {
    const buf = new Uint8Array(wx.base64ToArrayBuffer(base64));
    if (buf.length === 0) {
      throw new Error('服务端公钥为空');
    }
    // 1) 已是原始 EC 点：未压缩 65 字节（04||x||y）或压缩 33 字节（02|03||x）
    if (buf.length === 65 && buf[0] === 0x04) {
      return this.arrayBufferToHex(buf.slice());
    }
    if (buf.length === 33 && (buf[0] === 0x02 || buf[0] === 0x03)) {
      return this.arrayBufferToHex(buf.slice());
    }
    // 2) X.509 SubjectPublicKeyInfo（或其它 DER）：在 BIT STRING 或整体载荷里找 EC 点
    if (buf[0] === 0x30) {
      const pointHex = this._extractEcPointHexFromDer(buf);
      if (pointHex) return pointHex;
    }
    // 3) 降级：在缓冲区中搜索未压缩点前缀 04（跳过典型 OID 区段，减少误判）
    for (let i = 16; i <= buf.length - 65; i++) {
      if (buf[i] === 0x04) {
        return this.arrayBufferToHex(buf.slice(i, i + 65));
      }
    }
    throw new Error('无法从服务端公钥中解析 EC 点（非 SPKI/非原始点格式）');
  }

  /**
   * 从 DER 中提取 P-256 公钥点（SubjectPublicKeyInfo 中 BIT STRING：1 字节未用位数 + 点坐标）
   */
  _extractEcPointHexFromDer(bytes) {
    let i = 0;
    if (bytes[i++] !== 0x30) return null;
    const seqLen = this._readDerLength(bytes, i);
    i = seqLen.nextOffset;
    // AlgorithmIdentifier SEQUENCE
    if (bytes[i++] !== 0x30) return null;
    const algLen = this._readDerLength(bytes, i);
    i = algLen.nextOffset + algLen.length;
    // subjectPublicKey BIT STRING
    if (i >= bytes.length || bytes[i] !== 0x03) return null;
    i++;
    const bitLen = this._readDerLength(bytes, i);
    i = bitLen.nextOffset;
    const end = i + bitLen.length;
    if (end > bytes.length) return null;
    // DER BIT STRING 首字节为末字节未用位数，EC 公钥为整字节时通常为 0
    let j = i;
    if (j < end) j += 1;
    if (j <= end - 65 && bytes[j] === 0x04) {
      return this.arrayBufferToHex(bytes.slice(j, j + 65));
    }
    if (j <= end - 33 && (bytes[j] === 0x02 || bytes[j] === 0x03)) {
      return this.arrayBufferToHex(bytes.slice(j, j + 33));
    }
    // 少数实现无单独 unused-bits 字节（不规范，兜底）
    if (i <= end - 65 && bytes[i] === 0x04) {
      return this.arrayBufferToHex(bytes.slice(i, i + 65));
    }
    return null;
  }

  _readDerLength(bytes, start) {
    const first = bytes[start];
    if (first === undefined) return { length: 0, nextOffset: start + 1 };
    if ((first & 0x80) === 0) {
      return { length: first, nextOffset: start + 1 };
    }
    const numOctets = first & 0x7f;
    let len = 0;
    let o = start + 1;
    for (let k = 0; k < numOctets && o < bytes.length; k++, o++) {
      len = (len << 8) | bytes[o];
    }
    return { length: len, nextOffset: o };
  }

  /**
   * 计算共享密钥（ECDH）
   */
  async deriveSharedKey(serverPublicKeyBase64) {
    try {
      // Step 1: 解析服务端公钥（可能是 X.509 或 65 字节原始点）为椭圆曲线点 hex
      const serverPublicKeyHex = this.parseServerPublicKeyToPointHex(serverPublicKeyBase64);

      // Step 2: 从 hex 创建服务器公钥对象
      const serverPublicKey = this.ec.keyFromPublic(serverPublicKeyHex, 'hex');
      
      // Step 3: 使用客户端私钥和服务器公钥计算共享秘密
      const sharedSecret = this.clientKeyPair.derive(serverPublicKey.pub);
      
      // Step 4: 使用 SHA-256 派生 AES-256 密钥
      const sharedSecretHex = sharedSecret.toString(16).padStart(64, '0');
      const sha256Hash = CryptoJS.SHA256(CryptoJS.enc.Hex.parse(sharedSecretHex)).toString();
      
      this.sharedKeyHex = sha256Hash;
      
      console.log('✅ 共享密钥计算完成');
    } catch (error) {
      console.error('❌ 共享密钥计算失败:', error);
      throw error;
    }
  }

  /**
   * 从 ApiResult 中取出 SecureEncryptedResponse（可能在根上或 data 里）
   */
  pickSecureEnvelope(apiResult) {
    if (!apiResult) return null;
    if (apiResult.data && apiResult.data.encryptedData) return apiResult.data;
    if (apiResult.encryptedData) return apiResult;
    return null;
  }

  /**
   * 解密响应数据（AES-256-GCM，与后端 ECDHUtil AES/GCM/NoPadding + encodeEncryptedData 一致）
   * 载荷：IV(12) + 密文 + 16 字节 tag（Java Cipher#doFinal 标准输出）
   */
  async decryptResponse(encryptedResponse) {
    if (!this.sharedKeyHex) {
      throw new Error('共享密钥未初始化，请先执行密钥交换');
    }

    try {
      const { encryptedData, timestamp, nonce } = encryptedResponse;

      // Step 1: 验证时间戳（防重放）
      const now = Date.now();
      if (now - timestamp > 300000) { // 5分钟
        throw new Error('响应已过期');
      }

      // Step 2: 解码 Base64
      const combinedArrayBuffer = wx.base64ToArrayBuffer(encryptedData);
      const combinedBytes = new Uint8Array(combinedArrayBuffer);

      // Step 3: GCM：nonce 12 字节；其后为密文 + tag（与 Java 一致）
      const GCM_IV_LENGTH = 12;
      if (combinedBytes.length <= GCM_IV_LENGTH) {
        throw new Error('加密数据长度无效');
      }
      const nonceBytes = combinedBytes.slice(0, GCM_IV_LENGTH);
      const ciphertextAndTag = combinedBytes.slice(GCM_IV_LENGTH);

      const keyBytes = hexToBytes(this.sharedKeyHex);
      const aes = gcm(keyBytes, nonceBytes);
      const plaintext = aes.decrypt(ciphertextAndTag);
      const decryptedText = bytesToUtf8(plaintext);

      if (!decryptedText) {
        throw new Error('解密结果为空，可能是密钥不匹配');
      }

      const jsonData = JSON.parse(decryptedText);
      
      console.log('✅ 响应解密成功');
      return jsonData;

    } catch (error) {
      console.error('❌ 响应解密失败:', error);
      
      // 如果是解密失败，可能是密钥过期，清除会话
      if (error.message.includes('密钥') || error.message.includes('解密')) {
        this.clearSession();
      }
      
      throw error;
    }
  }

  /**
   * 发送加密请求（封装 wx.request）
   */
  async encryptedRequest(options) {
    const { url, method = 'GET', data = {}, needDecrypt = true } = options;

    // Step 1: 确保会话有效
    if (needDecrypt && !this.isSessionValid()) {
      console.log('🔄 会话无效，执行密钥交换...');
      await this.exchangeKeys();
    }

    // Step 2: 构建请求头
    const header = {
      'Content-Type': 'application/json',
      ...options.header
    };

    // 添加会话 ID
    if (needDecrypt && this.sessionId) {
      header['X-Session-Id'] = this.sessionId;
    }

    // Step 3: 发送请求
    const res = await this.wxRequest({
      url,
      method,
      header,
      data
    });

    // Step 4: 解密响应；wxRequest 的返回值即 HTTP body（常见为 ApiResult 包一层 data）
    const envelope = this.pickSecureEnvelope(res);
    if (needDecrypt && envelope) {
      console.log('🔐 检测到加密响应，开始解密...');
      const decryptedData = await this.decryptResponse(envelope);
      res.data = decryptedData;
    }

    return res;
  }

  /**
   * 封装 wx.request，统一错误处理
   */
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

  /**
   * 清除会话
   */
  clearSession() {
    this.sessionId = null;
    this.sharedKeyHex = null;
    this.clientKeyPair = null;
    storage.clearSession();
    console.log('🗑️ 会话已清除');
  }

  /**
   * 检查会话是否有效
   */
  isSessionValid() {
    return this.sessionId !== null && this.sharedKeyHex !== null;
  }

  /**
   * 获取会话 ID
   */
  getSessionId() {
    return this.sessionId;
  }

  // ========== 辅助函数 ==========

  /**
   * hex 转 Base64
   */
  hexToBase64(hex) {
    const typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16)));
    return wx.arrayBufferToBase64(typedArray.buffer);
  }

  /**
   * Base64 转 hex
   */
  base64ToHex(base64) {
    const buffer = wx.base64ToArrayBuffer(base64);
    return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * ArrayBuffer 转 hex
   */
  arrayBufferToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

// 单例模式
const ecdhManager = new ECDHManager();
module.exports = ecdhManager;
