/** 与 app.json tabBar.list 保持一致 */
export const TAB_ROOTS = [
  '/pages/category/index',
  '/pages/mknow/index',
  '/pages/my/index',
];

function ensureLeadingSlash(url = '') {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.startsWith('/') ? value : `/${value}`;
}

/** 规范化路径（补 /、可解码一次） */
export function normalizeUrl(url = '') {
  let value = ensureLeadingSlash(url);
  if (!value) return '';
  if (value.includes('%')) {
    try {
      value = ensureLeadingSlash(decodeURIComponent(value));
    } catch (e) {
      // keep original
    }
  }
  return value;
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

/**
 * 打开页面：Tab 自动 switchTab（丢弃 query），否则 navigateTo
 * @returns {Promise|undefined}
 */
export function openPage(options = {}) {
  const { url, fail } = options;
  const targetUrl = ensureLeadingSlash(url);
  if (!targetUrl) return Promise.resolve();

  if (isTabPage(targetUrl)) {
    return wx.switchTab({
      ...options,
      url: getRouteBase(targetUrl),
      fail,
    });
  }

  return wx.navigateTo({
    ...options,
    url: targetUrl,
  });
}

/** 显式 switchTab（仅 path，无 query） */
export function switchTabPage(options = {}) {
  const targetUrl = getRouteBase(options.url);
  if (!targetUrl) return Promise.resolve();
  return wx.switchTab({
    ...options,
    url: targetUrl,
  });
}

/**
 * redirectTo；若目标是 Tab 则改用 switchTab
 */
export function redirectPage(options = {}) {
  const targetUrl = ensureLeadingSlash(options.url);
  if (!targetUrl) return Promise.resolve();

  if (isTabPage(targetUrl)) {
    return wx.switchTab({
      ...options,
      url: getRouteBase(targetUrl),
    });
  }

  return wx.redirectTo({
    ...options,
    url: targetUrl,
  });
}

export function reLaunchPage(options = {}) {
  const targetUrl = ensureLeadingSlash(options.url);
  if (!targetUrl) return Promise.resolve();
  return wx.reLaunch({
    ...options,
    url: isTabPage(targetUrl) ? getRouteBase(targetUrl) : targetUrl,
  });
}

export function backPage(options = {}) {
  return wx.navigateBack(options);
}

/**
 * 级联打开：优先策略失败后依次降级
 * - Tab + preferReLaunch: reLaunch → switchTab
 * - Tab: switchTab
 * - 非 Tab + preferReLaunch: reLaunch → redirect → navigate
 * - 非 Tab: navigate → redirect → reLaunch
 */
export function openUrlCascade(url, options = {}) {
  const { preferReLaunch = false, onFail } = options;
  const targetUrl = normalizeUrl(url);
  if (!targetUrl) {
    if (typeof onFail === 'function') onFail();
    return;
  }

  const base = getRouteBase(targetUrl);

  if (isTabPage(targetUrl)) {
    if (preferReLaunch) {
      wx.reLaunch({
        url: base,
        fail: () => {
          wx.switchTab({
            url: base,
            fail: () => {
              if (typeof onFail === 'function') onFail();
            },
          });
        },
      });
      return;
    }
    wx.switchTab({
      url: base,
      fail: () => {
        if (typeof onFail === 'function') onFail();
      },
    });
    return;
  }

  if (preferReLaunch) {
    wx.reLaunch({
      url: targetUrl,
      fail: () => {
        wx.redirectTo({
          url: targetUrl,
          fail: () => {
            wx.navigateTo({
              url: targetUrl,
              fail: () => {
                if (typeof onFail === 'function') onFail();
              },
            });
          },
        });
      },
    });
    return;
  }

  wx.navigateTo({
    url: targetUrl,
    fail: () => {
      wx.redirectTo({
        url: targetUrl,
        fail: () => {
          wx.reLaunch({
            url: targetUrl,
            fail: () => {
              if (typeof onFail === 'function') onFail();
            },
          });
        },
      });
    },
  });
}

/**
 * 登录成功后回到业务页：
 * - Tab → switchTab
 * - 非 Tab → 先 navigateBack，再 navigate；失败则 redirect / reLaunch
 */
export function resumeAfterLogin(url) {
  const targetUrl = normalizeUrl(url);
  if (!targetUrl) {
    switchTabPage({ url: '/pages/my/index' });
    return;
  }

  if (isTabPage(targetUrl)) {
    switchTabPage({ url: targetUrl });
    return;
  }

  wx.navigateBack({
    delta: 1,
    success: () => {
      openUrlCascade(targetUrl);
    },
    fail: () => {
      wx.redirectTo({
        url: targetUrl,
        fail: () => wx.reLaunch({ url: targetUrl }),
      });
    },
  });
}

/** redirect，失败则 navigate（选职业等） */
export function redirectOrNavigate(url) {
  const targetUrl = ensureLeadingSlash(url);
  if (!targetUrl) return;
  if (isTabPage(targetUrl)) {
    switchTabPage({ url: targetUrl });
    return;
  }
  wx.redirectTo({
    url: targetUrl,
    fail: () => wx.navigateTo({ url: targetUrl }),
  });
}

/** 401 等：优先 reLaunch 进登录页，失败再 redirect；返回 Promise */
export function goToLoginPage(loginUrl) {
  const url = ensureLeadingSlash(loginUrl) || buildLoginUrl();
  return new Promise((resolve, reject) => {
    wx.reLaunch({
      url,
      success: resolve,
      fail: (err) => {
        wx.redirectTo({
          url,
          success: resolve,
          fail: (err2) => reject(err2 || err),
        });
      },
    });
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
