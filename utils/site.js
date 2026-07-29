import { siteApi } from '~/api/index';
import { getPersistedTtlCache, setPersistedTtlCache } from '~/utils/ttlCache';

const DEFAULT_SITE_INFO = {
  productName: '面试胶囊',
  slogan: '让每一次面试准备更有把握',
  phone: '400-xxx-xxxx',
  email: 'service@yourcompany.com',
  icp: '京ICP备xxxxxxxx号',
  copyright: '© 2026 面试胶囊',
};

const SITE_TTL_MS = 30 * 60 * 1000;
const SITE_CACHE_KEY = 'site:info';
const SITE_STORAGE_KEY = 'site_info_cache';

function pickPayload(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data !== undefined && res.data !== null && typeof res.data === 'object') {
    return res.data;
  }
  return res;
}

export function getDefaultSiteInfo() {
  return { ...DEFAULT_SITE_INFO };
}

export function normalizeSiteInfo(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    productName: source.productName || DEFAULT_SITE_INFO.productName,
    slogan: source.slogan || DEFAULT_SITE_INFO.slogan,
    phone: source.phone || source.servicePhone || DEFAULT_SITE_INFO.phone,
    email: source.email || source.serviceEmail || DEFAULT_SITE_INFO.email,
    icp: source.icp || source.icpNo || DEFAULT_SITE_INFO.icp,
    copyright: source.copyright || DEFAULT_SITE_INFO.copyright,
  };
}

/** 拉取站点页脚信息；失败回落本地默认（带 TTL 缓存） */
export async function fetchSiteInfo() {
  const cached = getPersistedTtlCache(SITE_CACHE_KEY, SITE_STORAGE_KEY);
  if (cached && typeof cached === 'object') {
    return { ...cached };
  }

  try {
    const res = await siteApi.getSiteInfo();
    const info = normalizeSiteInfo(pickPayload(res));
    setPersistedTtlCache(SITE_CACHE_KEY, info, SITE_TTL_MS, SITE_STORAGE_KEY);
    return info;
  } catch (e) {
    console.warn('[site] fetch site info failed', e);
    return getDefaultSiteInfo();
  }
}

/** 是否为可拨打的真实电话（排除占位符） */
export function isCallablePhone(phone) {
  const value = String(phone || '').trim();
  if (!value) return false;
  if (/x/i.test(value)) return false;
  return /[\d+]/.test(value);
}
