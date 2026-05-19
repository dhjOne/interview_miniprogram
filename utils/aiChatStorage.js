const STORAGE_KEY = 'mknow_chat_messages';
const SESSION_KEY = 'mknow_session_id';

export function getSessionId() {
  let id = wx.getStorageSync(SESSION_KEY);
  if (!id) {
    id = `mknow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    wx.setStorageSync(SESSION_KEY, id);
  }
  return id;
}

export function resetSessionId() {
  const id = `mknow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  wx.setStorageSync(SESSION_KEY, id);
  return id;
}

export function loadMessages() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

export function saveMessages(messages) {
  try {
    wx.setStorageSync(STORAGE_KEY, messages.slice(-50));
  } catch (e) {
    // ignore quota
  }
}

export function clearMessages() {
  wx.removeStorageSync(STORAGE_KEY);
}
