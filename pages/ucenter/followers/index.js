import { createSocialListPage } from '../common/listPageBehavior';

const pageDef = createSocialListPage('followers');

Page({
  ...pageDef,
  data: {
    ...pageDef.data,
    pageTitle: '我的粉丝',
    heroTitle: '粉丝列表',
    heroSub: '关注你的用户会出现在这里',
    showFollowBtn: true
  }
});
