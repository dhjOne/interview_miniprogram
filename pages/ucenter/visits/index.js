import { createSocialListPage } from '../common/listPageBehavior';

const pageDef = createSocialListPage('visits');

Page({
  ...pageDef,
  data: {
    ...pageDef.data,
    pageTitle: '主页访问',
    heroTitle: '谁看过我',
    heroSub: '最近访问你主页的用户记录'
  }
});
