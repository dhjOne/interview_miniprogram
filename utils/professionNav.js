/** 职业页导航（独立模块，避免与 api 层循环依赖导致导出未就绪） */
export const PROFESSION_PAGE_PATH = '/pages/my/profession/index';

export function navigateToProfessionPage(options = {}) {
  const app = getApp();
  if (options.requireLogin !== false) {
    app.navigateToLogin({ url: PROFESSION_PAGE_PATH });
    return;
  }
  wx.navigateTo({ url: PROFESSION_PAGE_PATH });
}
