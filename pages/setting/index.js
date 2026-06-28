import useToastBehavior from '~/behaviors/useToast';
import { authApi } from '~/api/request/api_login';
import { profileApi, pickProfileData } from '~/api/request/api_profile';
import {
  QUESTION_SCOPE_OPTIONS,
  getLocalSettings,
  questionScopeLabel,
  saveLocalSettings
} from '~/utils/userSettings';
import { clearQuestionBrowseHistory, getQuestionBrowseHistoryCount } from '~/utils/questionBrowseHistory';
import { clearServerBrowseHistory, hasLoginToken } from '~/utils/practiceBrowse';

const app = getApp();

Page({
  behaviors: [useToastBehavior],

  data: {
    phoneMasked: '',
    settings: getLocalSettings(),
    historyCount: 0,
    questionScopeVisible: false,
    questionScopeOptions: QUESTION_SCOPE_OPTIONS,
    menuData: [
      [
        {
          title: '个人资料与面试方向',
          icon: 'user',
          type: 'profile',
          url: '/pages/my/info-edit/index',
          desc: '完善昵称、简介、职业方向'
        },
        {
          title: '面试练习提醒',
          icon: 'notification',
          type: 'notify',
          switchable: true,
          switchKey: 'notifyEnabled',
          desc: '接收练习、收藏和互动提醒'
        }
      ],
      [
        {
          title: '题库默认展示',
          icon: 'filter',
          type: 'questionScope',
          noteKey: 'defaultQuestionScope',
          desc: '进入题库页时优先展示的范围'
        },
        {
          title: '自动记录练习足迹',
          icon: 'browse',
          type: 'autoRecordPractice',
          switchable: true,
          switchKey: 'autoRecordPractice',
          desc: '浏览题目时自动加入历史记录'
        }
      ],
      [
        {
          title: '清空学习记录',
          icon: 'delete',
          type: 'clearHistory',
          noteKey: 'historyCount',
          desc: '清理本地浏览历史'
        },
        {
          title: '账号安全',
          icon: 'secured',
          type: 'security',
          desc: '查看当前绑定手机号'
        },
        {
          title: '退出登录',
          icon: 'logout',
          type: 'logout',
          theme: 'danger'
        }
      ]
    ]
  },

  onShow() {
    this.loadPageData();
  },

  async loadPageData() {
    const local = getLocalSettings();
    this.setData({
      settings: local,
      historyCount: getQuestionBrowseHistoryCount()
    });
    try {
      const [profileRes, settingsRes] = await Promise.all([
        profileApi.getPersonalInfo(),
        profileApi.getSettings()
      ]);
      const profile = pickProfileData(profileRes) || {};
      const remoteSettings = pickProfileData(settingsRes) || {};
      const merged = { ...local, ...remoteSettings };
      const normalized = saveLocalSettings(merged);
      this.setData({
        phoneMasked: this.maskPhone(profile.phone),
        settings: normalized,
        historyCount: getQuestionBrowseHistoryCount()
      });
    } catch (e) {
      console.warn('[setting] 加载设置失败，使用本地缓存', e);
    }
  },

  maskPhone(phone) {
    if (!phone || phone.length < 7) return '未绑定手机号';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  },

  getMenuNote(item) {
    if (!item.noteKey) return '';
    const { settings } = this.data;
    if (item.noteKey === 'defaultQuestionScope') return questionScopeLabel(settings.defaultQuestionScope);
    if (item.noteKey === 'historyCount') return `${this.data.historyCount || 0} 条`;
    return '';
  },

  onMenuTap(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    if (item.url) {
      app.navigateToLogin({ url: item.url });
      return;
    }

    switch (item.type) {
      case 'questionScope':
        this.setData({ questionScopeVisible: true });
        break;
      case 'clearHistory':
        this.confirmClearHistory();
        break;
      case 'security':
        wx.showModal({
          title: '账号安全',
          content: `当前绑定手机：${this.data.phoneMasked}`,
          showCancel: false
        });
        break;
      case 'logout':
        this.confirmLogout();
        break;
      default:
        break;
    }
  },

  async onSwitchChange(e) {
    const { key } = e.currentTarget.dataset;
    const { value } = e.detail;
    if (!key) return;
    const next = saveLocalSettings({ [key]: value });
    this.setData({ settings: next });
    try {
      await profileApi.updateSettings({ [key]: value });
    } catch (err) {
      console.warn('[setting] 同步设置失败', err);
    }
  },

  async onQuestionScopePick(e) {
    const { value } = e.detail;
    const defaultQuestionScope = Array.isArray(value) ? value[0] : value;
    const next = saveLocalSettings({ defaultQuestionScope });
    this.setData({ settings: next, questionScopeVisible: false });
    try {
      wx.setStorageSync('category_pending_scope', defaultQuestionScope);
    } catch (err) {
      // ignore
    }
    try {
      await profileApi.updateSettings({ defaultQuestionScope });
    } catch (err) {
      console.warn('[setting] 同步题库偏好失败', err);
    }
  },

  hidePicker(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({ [`${mode}Visible`]: false });
  },

  confirmClearHistory() {
    wx.showModal({
      title: '清空学习记录',
      content: '将清空本机题目浏览历史。登录状态下也会尝试同步清理服务端练习历史。',
      confirmText: '清空',
      confirmColor: '#d54941',
      success: async (res) => {
        if (!res.confirm) return;
        clearQuestionBrowseHistory();
        if (hasLoginToken()) {
          try {
            await clearServerBrowseHistory();
          } catch (err) {
            console.warn('[setting] 清理服务端学习记录失败', err);
          }
        }
        this.setData({ historyCount: 0 });
        this.onShowToast('#t-toast', '学习记录已清空');
      }
    });
  },

  confirmLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await authApi.logout();
        } catch (e) {
          // 忽略退出接口失败，仍清理本地态
        }
        try {
          wx.removeStorageSync('access_token');
          wx.removeStorageSync('refresh_token');
          wx.removeStorageSync('user_info');
        } catch (err) {
          // ignore
        }
        if (app.globalData) {
          app.globalData.userInfo = null;
          app.globalData.token = null;
        }
        this.onShowToast('#t-toast', '已退出登录');
        setTimeout(() => {
          wx.switchTab({ url: '/pages/my/index' });
        }, 400);
      }
    });
  }
});
