/**
 * 进程内 TTL 缓存（可选落盘，跨冷启动复用低频配置）
 */

const memory = Object.create(null);

export function getTtlCache(key) {
  const hit = memory[key];
  if (!hit) return null;
  if (Date.now() >= hit.expireAt) {
    delete memory[key];
    return null;
  }
  return hit.value;
}

export function setTtlCache(key, value, ttlMs = 5 * 60 * 1000) {
  memory[key] = {
    value,
    expireAt: Date.now() + Math.max(0, ttlMs),
  };
  return value;
}

export function clearTtlCache(key) {
  if (key == null) {
    Object.keys(memory).forEach((k) => delete memory[k]);
    return;
  }
  delete memory[key];
}

/**
 * 读内存 → 读 Storage → 未命中返回 null
 * Storage 结构：{ v, e }（value / expireAt）
 */
export function getPersistedTtlCache(key, storageKey) {
  const mem = getTtlCache(key);
  if (mem != null) return mem;
  if (!storageKey) return null;
  try {
    const raw = wx.getStorageSync(storageKey);
    if (!raw || typeof raw !== 'object') return null;
    if (Date.now() >= Number(raw.e || 0)) {
      wx.removeStorageSync(storageKey);
      return null;
    }
    setTtlCache(key, raw.v, Math.max(0, Number(raw.e) - Date.now()));
    return raw.v;
  } catch (e) {
    return null;
  }
}

export function setPersistedTtlCache(key, value, ttlMs, storageKey) {
  setTtlCache(key, value, ttlMs);
  if (!storageKey) return value;
  try {
    wx.setStorageSync(storageKey, {
      v: value,
      e: Date.now() + Math.max(0, ttlMs),
    });
  } catch (e) {
    // ignore quota
  }
  return value;
}
