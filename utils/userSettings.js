const STORAGE_KEY = 'mini_user_settings';

const DEFAULT_SETTINGS = {
  notifyEnabled: true,
  defaultQuestionScope: 'career',
  autoRecordPractice: true
};

function normalizeSettings(settings = {}) {
  return {
    notifyEnabled: settings.notifyEnabled ?? DEFAULT_SETTINGS.notifyEnabled,
    defaultQuestionScope: settings.defaultQuestionScope || DEFAULT_SETTINGS.defaultQuestionScope,
    autoRecordPractice: settings.autoRecordPractice ?? DEFAULT_SETTINGS.autoRecordPractice
  };
}

export function getLocalSettings() {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY);
    return normalizeSettings(stored || {});
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLocalSettings(partial) {
  const next = normalizeSettings({ ...getLocalSettings(), ...(partial || {}) });
  try {
    wx.setStorageSync(STORAGE_KEY, next);
  } catch (e) {
    // ignore
  }
  return next;
}

export const QUESTION_SCOPE_OPTIONS = [
  { label: '我的职业优先', value: 'career' },
  { label: '展示全部题库', value: 'all' }
];

export function questionScopeLabel(value) {
  const item = QUESTION_SCOPE_OPTIONS.find((opt) => opt.value === value);
  return item ? item.label : '我的职业优先';
}
