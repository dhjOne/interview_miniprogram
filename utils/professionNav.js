/** 职业页导航（独立模块，避免与 api 层循环依赖导致导出未就绪） */
import { navigateToLogin, openPage } from './router';

export const PROFESSION_PAGE_PATH = '/pages/my/profession/index';

export function navigateToProfessionPage(options = {}) {
  const app = getApp();
  if (options.requireLogin !== false) {
    navigateToLogin({ url: PROFESSION_PAGE_PATH }, app);
    return;
  }
  openPage({ url: PROFESSION_PAGE_PATH });
}
