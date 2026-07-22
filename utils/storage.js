// utils/storage.js
const STORAGE_KEY = 'ecdh_session_info';

/** 与后端 ECDHSessionManager.SessionInfo.SESSION_EXPIRY 一致（30 分钟） */
const SESSION_TTL_MS = 30 * 60 * 1000;

function saveSession(sessionInfo) {
  try {
    const now = Date.now();
    const data = {
      sessionId: sessionInfo.sessionId,
      sharedKeyHex: sessionInfo.sharedKeyHex,
      createTime: sessionInfo.createTime || now,
      lastActiveTime: now,
      expireTime: SESSION_TTL_MS,
    };
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('保存会话失败:', error);
  }
}

function touchSession() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return;
    const sessionInfo = JSON.parse(raw);
    sessionInfo.lastActiveTime = Date.now();
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(sessionInfo));
  } catch (error) {
    console.warn('更新会话活跃时间失败:', error);
  }
}

function loadSession() {
  try {
    const data = wx.getStorageSync(STORAGE_KEY);
    if (!data) {
      return null;
    }
    const sessionInfo = JSON.parse(data);
    const now = Date.now();
    const lastActive = sessionInfo.lastActiveTime || sessionInfo.createTime;
    if (now - lastActive > (sessionInfo.expireTime || SESSION_TTL_MS)) {
      clearSession();
      return null;
    }
    return sessionInfo;
  } catch (error) {
    console.error('加载会话失败:', error);
    return null;
  }
}

function clearSession() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (error) {
    console.error('清除会话失败:', error);
  }
}

function isSessionValid() {
  const session = loadSession();
  return session !== null && session.sessionId && session.sharedKeyHex;
}

module.exports = {
  SESSION_TTL_MS,
  saveSession,
  loadSession,
  clearSession,
  touchSession,
  isSessionValid,
};
