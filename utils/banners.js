import { bannerApi } from '~/api/index';
import { navigateToLogin, openPage } from '~/utils/router';

export const POSITION_MY_CAROUSEL = 'MY_CAROUSEL';
export const POSITION_QUESTION_FEED = 'QUESTION_FEED';
export const POSITION_QUESTION_TOP = 'QUESTION_TOP';
export const POSITION_CATEGORY_TOP = 'CATEGORY_TOP';
export const POSITION_CATEGORY_FEED = 'CATEGORY_FEED';

/** 与后端种子 / 离线兜底一致 */
const DEFAULT_MY_CAROUSEL = [
  {
    id: 'local-0',
    title: '创作过审得积分',
    image: '/static/home/card0.png',
    linkType: 'PAGE',
    linkUrl: '/pages/ucenter/points/index'
  },
  {
    id: 'local-1',
    title: '刷题排行挑战',
    image: '/static/home/card1.png',
    linkType: 'PAGE',
    linkUrl: '/pages/ucenter/ranking/index'
  },
  {
    id: 'local-2',
    title: '商务合作咨询',
    image: '/static/home/card2.png',
    linkType: 'PAGE',
    linkUrl: '/pages/ucenter/business/index'
  }
];

function pickPayload(res) {
  if (!res || typeof res !== 'object') return null;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  return null;
}

function todayKey() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function getDefaultMyCarousel() {
  return DEFAULT_MY_CAROUSEL.map((item) => ({ ...item }));
}

export function normalizeBannerItem(raw, index = 0) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const image = source.imageUrl || source.image || '';
  return {
    id: source.id != null ? String(source.id) : `banner-${index}`,
    title: source.title || '',
    image,
    linkType: source.linkType || 'NONE',
    linkUrl: source.linkUrl || ''
  };
}

/**
 * @param {any[]} list
 * @param {{ requireImage?: boolean, fallbackMyCarousel?: boolean }} [opts]
 */
export function normalizeBannerList(list, opts = {}) {
  const requireImage = opts.requireImage !== false;
  const fallbackMyCarousel = !!opts.fallbackMyCarousel;
  if (!Array.isArray(list) || !list.length) {
    return fallbackMyCarousel ? getDefaultMyCarousel() : [];
  }
  const normalized = list
    .map((item, index) => normalizeBannerItem(item, index))
    .filter((item) => item.title && (!requireImage || item.image));
  if (!normalized.length && fallbackMyCarousel) {
    return getDefaultMyCarousel();
  }
  return normalized;
}

/** 拉取运营位；仅我的页轮播在失败/空时回落本地默认 */
export async function fetchBannersByPosition(position = POSITION_MY_CAROUSEL) {
  const isMyCarousel = position === POSITION_MY_CAROUSEL;
  try {
    const res = await bannerApi.listByPosition(position);
    const list = pickPayload(res);
    return normalizeBannerList(list || [], {
      requireImage: true,
      fallbackMyCarousel: isMyCarousel
    });
  } catch (e) {
    console.warn('[banners] fetch failed', position, e);
    return isMyCarousel ? getDefaultMyCarousel() : [];
  }
}

/** 是否需要登录后跳转（商务合作等公开页除外） */
export function bannerNeedsLogin(linkUrl) {
  const url = String(linkUrl || '').split('?')[0];
  if (!url) return false;
  if (url.indexOf('/pages/ucenter/business/') === 0) return false;
  if (url.indexOf('/pages/agreement/') === 0) return false;
  if (url.indexOf('/pages/ucenter/') === 0) return true;
  if (url.indexOf('/pages/creator/') === 0) return true;
  if (url.indexOf('/pages/publish/') === 0) return true;
  if (url.indexOf('/pages/document/') === 0) return true;
  if (url.indexOf('/pages/dataCenter/') === 0) return true;
  return false;
}

/** 打开运营位跳转 */
export function openBannerLink(item) {
  if (!item || item.linkType !== 'PAGE' || !item.linkUrl) return;
  const app = getApp();
  if (bannerNeedsLogin(item.linkUrl)) {
    navigateToLogin({ url: item.linkUrl }, app);
    return;
  }
  openPage({ url: item.linkUrl });
}

export function isBannerDismissedToday(position) {
  try {
    return wx.getStorageSync(`ops_dismiss_${position}`) === todayKey();
  } catch (e) {
    return false;
  }
}

export function dismissBannerToday(position) {
  try {
    wx.setStorageSync(`ops_dismiss_${position}`, todayKey());
  } catch (e) {
    // ignore
  }
}

/** 单条素材当日关闭（信息流关闭按钮） */
export function isBannerItemDismissedToday(bannerId) {
  if (bannerId == null || bannerId === '') return false;
  try {
    const raw = wx.getStorageSync('ops_dismiss_items');
    const map = raw && typeof raw === 'object' ? raw : {};
    return map[String(bannerId)] === todayKey();
  } catch (e) {
    return false;
  }
}

export function dismissBannerItemToday(bannerId) {
  if (bannerId == null || bannerId === '') return;
  try {
    const raw = wx.getStorageSync('ops_dismiss_items');
    const map = raw && typeof raw === 'object' ? { ...raw } : {};
    map[String(bannerId)] = todayKey();
    wx.setStorageSync('ops_dismiss_items', map);
  } catch (e) {
    // ignore
  }
}

/** 过滤掉用户当日已关闭的素材 */
export function filterDismissedBanners(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return list.filter((item) => item && !isBannerItemDismissedToday(item.id));
}

/**
 * 在内容列表中按间隔插入运营位
 * @param {any[]} items 原始内容
 * @param {any[]} ads 运营位
 * @param {{ every?: number, minBeforeFirst?: number, maxAds?: number, idPrefix?: string }} [options]
 */
export function interleaveFeedItems(items, ads, options = {}) {
  const every = Math.max(1, Number(options.every) || 10);
  const minBeforeFirst = Math.max(1, Number(options.minBeforeFirst) || 4);
  const maxAds = options.maxAds == null ? Infinity : Number(options.maxAds);
  const idPrefix = options.idPrefix || 'ops-ad';

  if (!Array.isArray(items) || !items.length) {
    return [];
  }

  if (!Array.isArray(ads) || !ads.length || maxAds <= 0) {
    return items.map((item, index) => ({
      ...item,
      rowType: 'item',
      displayIndex: index + 1,
      _rowKey: `item-${item.id != null ? item.id : index}`
    }));
  }

  const result = [];
  let adCursor = 0;
  let adsInserted = 0;
  let contentCount = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    contentCount += 1;
    result.push({
      ...item,
      rowType: 'item',
      displayIndex: contentCount,
      _rowKey: `item-${item.id != null ? item.id : i}`
    });

    const reachFirst = contentCount === minBeforeFirst;
    const reachInterval =
      contentCount > minBeforeFirst && (contentCount - minBeforeFirst) % every === 0;
    if (adsInserted < maxAds && (reachFirst || reachInterval)) {
      const ad = ads[adCursor % ads.length];
      adCursor += 1;
      adsInserted += 1;
      result.push({
        ...ad,
        rowType: 'ad',
        displayIndex: null,
        _rowKey: `${idPrefix}-${ad.id}-${adsInserted}`
      });
    }
  }

  return result;
}
