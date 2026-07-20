const TAB_ROOTS = [
  '/pages/category/index',
  '/pages/mknow/index',
  '/pages/my/index',
];

function ensureLeadingSlash(url = '') {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.startsWith('/') ? value : `/${value}`;
}

export function getRouteBase(url = '') {
  return ensureLeadingSlash(url).split('?')[0];
}

export function isTabPage(url = '') {
  return TAB_ROOTS.includes(getRouteBase(url));
}

export function getCurrentPagePath() {
  const pages = getCurrentPages();
  const cur = pages[pages.length - 1];
  if (!cur) return '';
  const route = ensureLeadingSlash(cur.route || '');
  const opts = cur.options || {};
  const query = Object.keys(opts)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(opts[key])}`)
    .join('&');
  return `${route}${query ? `?${query}` : ''}`;
}

export function buildLoginUrl(extraQuery = '') {
  const referrer = getCurrentPagePath();
  if (referrer) {
    try {
      wx.setStorageSync('login_referrer', referrer);
    } catch (e) {
      // ignore
    }
  }
  const referrerQuery = referrer ? `&referrer=${encodeURIComponent(referrer)}` : '';
  return `/pages/login/login?from=token_expired${referrerQuery}${extraQuery || ''}`;
}

export function openPage(options = {}) {
  const { url, fail } = options;
  const targetUrl = ensureLeadingSlash(url);
  if (!targetUrl) return;

  if (isTabPage(targetUrl)) {
    wx.switchTab({
      ...options,
      url: getRouteBase(targetUrl),
      fail,
    });
    return;
  }

  wx.navigateTo({
    ...options,
    url: targetUrl,
  });
}

function goLogin(loginUrl) {
  wx.navigateTo({
    url: loginUrl,
    fail: () => {
      wx.redirectTo({ url: loginUrl });
    },
  });
}

export function navigateToLogin(options = {}, app) {
  const targetUrl = options.url || '';
  if (app && typeof app.checkLoginStatus === 'function' && !app.checkLoginStatus()) {
    const returnQuery = targetUrl ? `&return=${encodeURIComponent(targetUrl)}` : '';
    goLogin(buildLoginUrl(returnQuery));
    return;
  }
  openPage(options);
}

export function navigateToWithAuth(options = {}, app) {
  const targetUrl = options.url || '';
  if (app && typeof app.checkLoginStatus === 'function' && app.checkLoginStatus()) {
    openPage(options);
    return;
  }

  wx.showModal({
    title: '提示',
    content: '登录已过期，请重新登录',
    showCancel: false,
    confirmText: '去登录',
    success: (res) => {
      if (!res.confirm) return;
      const returnQuery = targetUrl ? `&return=${encodeURIComponent(targetUrl)}` : '';
      goLogin(buildLoginUrl(returnQuery));
    },
  });
}
