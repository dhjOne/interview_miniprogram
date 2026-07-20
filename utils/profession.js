import { profileApi, unwrapData } from '~/api/index';

let cachedOptions = null;

const PROFESSION_META = {
  backend: { icon: 'server', color: '#0052d9', bg: 'rgba(0, 82, 217, 0.12)', accent: '#366ef4' },
  frontend: { icon: 'logo-miniprogram', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)', accent: '#9333ea' },
  testing: { icon: 'secured', color: '#0891b2', bg: 'rgba(8, 145, 178, 0.12)', accent: '#06b6d4' },
  algorithm: { icon: 'chart-bubble', color: '#db2777', bg: 'rgba(219, 39, 119, 0.12)', accent: '#ec4899' },
  product: { icon: 'user-talk', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)', accent: '#f97316' },
  ops: { icon: 'cloud', color: '#059669', bg: 'rgba(5, 150, 105, 0.12)', accent: '#10b981' },
  data: { icon: 'layers', color: '#4f46e5', bg: 'rgba(79, 70, 229, 0.12)', accent: '#6366f1' },
  security: { icon: 'lock-on', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)', accent: '#ef4444' }
};

const DEFAULT_META = { icon: 'user', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', accent: '#94a3b8' };

function pickText(...values) {
  const value = values.find((item) => item !== undefined && item !== null && String(item).trim() !== '');
  return value === undefined ? '' : String(value);
}

function normalizeProfessionOption(item = {}) {
  const code = pickText(item.code, item.value, item.professionCode, item.dictValue, item.key, item.id);
  const label = pickText(item.label, item.name, item.professionName, item.title, item.text, code);
  const description = pickText(item.description, item.desc, item.remark);
  return { ...item, code, label, description };
}

export async function fetchProfessionOptions(forceRefresh = false) {
  if (!forceRefresh && cachedOptions) {
    return cachedOptions;
  }
  const res = await profileApi.getProfessionOptions();
  const list = unwrapData(res) || [];
  cachedOptions = decorateProfessionOptions(Array.isArray(list) ? list : []);
  return cachedOptions;
}

export function decorateProfessionOptions(options) {
  return (options || [])
    .map((item) => {
      const option = normalizeProfessionOption(item);
      if (!option.code) {
        return null;
      }
      const meta = PROFESSION_META[option.code] || DEFAULT_META;
      return { ...option, ...meta };
    })
    .filter(Boolean);
}

export function formatProfessionText(codes, options) {
  const selected = Array.isArray(codes) ? codes.map((code) => pickText(code)).filter(Boolean) : [];
  if (!selected.length) {
    return '请选择';
  }
  const labelMap = Object.fromEntries(
    (options || [])
      .map((item) => normalizeProfessionOption(item))
      .filter((item) => item.code)
      .map((item) => [item.code, item.label])
  );
  return selected.map((code) => labelMap[code] || code).join('、');
}

export function getCachedProfessionCodes() {
  const app = getApp();
  const info = app.getUserInfo?.() || wx.getStorageSync('user_info') || {};
  return Array.isArray(info.professionCodes) ? info.professionCodes : [];
}

export function hasProfessionSelected(codes) {
  return Array.isArray(codes) && codes.length > 0;
}

export { PROFESSION_PAGE_PATH, navigateToProfessionPage } from './professionNav';
