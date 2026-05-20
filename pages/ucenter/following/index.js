import { createSocialListPage } from '../common/listPageBehavior';

const pageDef = createSocialListPage('following');

Page({
  ...pageDef,
  data: {
    ...pageDef.data,
    pageTitle: '我的关注',
    pageDesc: '你关注的用户会出现在这里',
    heroTitle: '关注列表',
    heroSub: '查看你正在关注的刷题伙伴',
    showFollowBtn: true
  }
});
