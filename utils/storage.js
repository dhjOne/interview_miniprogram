// utils/storage.js
const STORAGE_KEY = 'ecdh_session_info';

/**
 * 保存会话信息到本地存储
 */
function saveSession(sessionInfo) {
  try {
    const data = {
      sessionId: sessionInfo.sessionId,
      sharedKeyHex: sessionInfo.sharedKeyHex,
      createTime: Date.now(),
      expireTime: 30 * 60 * 1000 // 30分钟
    };
    
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(data));
    console.log('✅ 会话信息已保存');
  } catch (error) {
    console.error('❌ 保存会话失败:', error);
  }
}

/**
 * 从本地存储加载会话信息
 */
function loadSession() {
  try {
    const data = wx.getStorageSync(STORAGE_KEY);
    if (!data) {
      return null;
    }
    
    const sessionInfo = JSON.parse(data);
    const now = Date.now();
    
    // 检查是否过期
    if (now - sessionInfo.createTime > sessionInfo.expireTime) {
      console.log('⚠️ 会话已过期，清除本地缓存');
      clearSession();
      return null;
    }
    
    console.log('✅ 会话信息已加载');
    return sessionInfo;
  } catch (error) {
    console.error('❌ 加载会话失败:', error);
    return null;
  }
}

/**
 * 清除本地会话信息
 */
function clearSession() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
    console.log('🗑️ 会话信息已清除');
  } catch (error) {
    console.error('❌ 清除会话失败:', error);
  }
}

/**
 * 检查会话是否有效
 */
function isSessionValid() {
  const session = loadSession();
  return session !== null && session.sessionId && session.sharedKeyHex;
}

module.exports = {
  saveSession,
  loadSession,
  clearSession,
  isSessionValid
};
