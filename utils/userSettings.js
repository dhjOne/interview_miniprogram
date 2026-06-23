const STORAGE_KEY = 'mini_user_settings';

const DEFAULT_SETTINGS = {
  notifyEnabled: true,
  darkMode: 'system',
  fontScale: 'medium',
  playWithSound: true
};

export function getLocalSettings() {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored || {}) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLocalSettings(partial) {
  const next = { ...getLocalSettings(), ...(partial || {}) };
  try {
    wx.setStorageSync(STORAGE_KEY, next);
  } catch (e) {
    // ignore
  }
  return next;
}

export function applyFontScale(scale) {
  const map = {
    small: '28rpx',
    medium: '32rpx',
    large: '36rpx'
  };
  const fontSize = map[scale] || map.medium;
  try {
    wx.setStorageSync('app_font_scale', scale);
  } catch (e) {
    // ignore
  }
  return fontSize;
}

export const DARK_MODE_OPTIONS = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色模式', value: 'light' },
  { label: '深色模式', value: 'dark' }
];

export const FONT_SCALE_OPTIONS = [
  { label: '小', value: 'small' },
  { label: '标准', value: 'medium' },
  { label: '大', value: 'large' }
];

export function darkModeLabel(value) {
  const item = DARK_MODE_OPTIONS.find((opt) => opt.value === value);
  return item ? item.label : '跟随系统';
}

export function fontScaleLabel(value) {
  const item = FONT_SCALE_OPTIONS.find((opt) => opt.value === value);
  return item ? item.label : '标准';
}
