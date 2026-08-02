import Message from 'tdesign-miniprogram/message/index';
import { socialApi, questionApi, handleApiError, unwrapData } from '~/api/index';
import { buildSharePanels } from '~/utils/questionDetail';
import {
  SHARE_ACTION,
  SHARE_CHANNEL,
  buildQuestionSharePath,
  trackQuestionShare,
} from '~/utils/questionShare';
import { ensureLoginForAction, getCurrentPagePath } from '~/utils/router';
import { ACTION_LOGIN_HINTS } from '~/utils/pendingAction';

/**
 * 题目详情：分享面板、复制链接、举报/拉黑作者
 * 依赖页面提供：questionId / authorId / authorDisplayName / questionDetail / refreshPage
 */
const questionShareBehavior = Behavior({
  data: {
    showShareActionSheet: false,
    showCustomGuide: false,
    shareGuideChannel: SHARE_CHANNEL.TIMELINE,
    shareGuideTitle: '分享到朋友圈',
    shareGuideStep2: '选择「分享到朋友圈」',
    sharePanels: buildSharePanels(false),
  },

  methods: {
    requireLoginForAction(actionType, payload = {}) {
      return ensureLoginForAction({
        app: getApp(),
        returnUrl: getCurrentPagePath(),
        content: ACTION_LOGIN_HINTS[actionType] || '登录后即可继续操作',
        action: {
          type: actionType,
          page: 'question_detail',
          questionId: String(this.data.questionId || ''),
          payload,
        },
      });
    },

    onShare() {
      if (this.data.isTimelineSinglePage) {
        wx.showToast({ title: '请前往小程序使用完整服务', icon: 'none' });
        return;
      }
      this.setData({ showShareActionSheet: true });
    },

    onShareOptionTap(event) {
      const { value } = event.currentTarget.dataset;
      if (!value || value === 'wechat') return;

      this.setData({ showShareActionSheet: false });
      this.handleShareAction(value);
    },

    /** open-type=share 直达系统好友分享，关闭面板即可 */
    onShareFriendButtonTap() {
      this.setData({ showShareActionSheet: false });
    },

    onSharePanelVisibleChange(e) {
      const visible = e.detail?.visible ?? e.detail;
      if (!visible) {
        this.setData({ showShareActionSheet: false });
      }
    },

    handleShareAction(value) {
      switch (value) {
        case 'copy':
          this.copyLink();
          break;
        case 'moment':
          this.shareToMoment();
          break;
        case 'memo':
          this.createInterviewMemo();
          break;
        case 'reportQuestion':
          this.reportQuestion();
          break;
        case 'reportAuthor':
          this.reportAuthor();
          break;
        case 'blockAuthor':
          this.blockAuthor();
          break;
        default:
          break;
      }
    },

    createInterviewMemo() {
      if (!this.requireLoginForAction('memo')) return;
      const detail = this.data.questionDetail || {};
      const params = [
        `questionId=${encodeURIComponent(this.data.questionId || detail.id || '')}`,
        `title=${encodeURIComponent(detail.title || '')}`,
        `categoryId=${encodeURIComponent(detail.categoryId || this.data.categoryId || '')}`,
        `categoryName=${encodeURIComponent(detail.categoryName || this.data.categoryName || '')}`,
      ].join('&');
      const url = `/pages/interviewMemo/edit/index?${params}`;
      wx.navigateTo({ url });
    },

    /** 兼容旧 ActionSheet */
    onShareOptionSelect(event) {
      const { selected } = event.detail;
      const flatItems = (this.data.sharePanels || []).flatMap((panel) => panel.items || []);
      const option = flatItems[selected.index];
      if (!option || option.value === 'wechat') return;

      this.setData({ showShareActionSheet: false });
      this.handleShareAction(option.value);
    },

    async reportQuestion() {
      if (!this.requireLoginForAction('report_question')) return;
      try {
        await socialApi.submitReport({
          targetType: 'QUESTION',
          targetId: this.data.questionId,
          targetUserId: this.data.authorId || undefined,
          targetTitle: this.data.questionDetail.title,
          reasonType: 'OTHER',
          reason: '题目内容举报',
        });
        const reportToast =
          typeof this.consumeResumeToast === 'function'
            ? this.consumeResumeToast('report_question', '举报已提交')
            : '举报已提交';
        wx.showToast({ title: reportToast, icon: 'none' });
      } catch (e) {
        if (this._resumeActionType === 'report_question') {
          this._resumeActionType = null;
        }
        handleApiError(e, { fallbackMessage: '提交失败' });
      }
    },

    async reportAuthor() {
      if (!this.requireLoginForAction('report_author')) return;
      if (!this.data.authorId) {
        wx.showToast({ title: '暂无作者信息', icon: 'none' });
        return;
      }
      try {
        await socialApi.submitReport({
          targetType: 'USER',
          targetId: this.data.authorId,
          targetUserId: this.data.authorId,
          targetTitle: this.data.authorDisplayName,
          reasonType: 'OTHER',
          reason: '作者举报',
        });
        const reportToast =
          typeof this.consumeResumeToast === 'function'
            ? this.consumeResumeToast('report_author', '举报已提交')
            : '举报已提交';
        wx.showToast({ title: reportToast, icon: 'none' });
      } catch (e) {
        if (this._resumeActionType === 'report_author') {
          this._resumeActionType = null;
        }
        handleApiError(e, { fallbackMessage: '提交失败' });
      }
    },

    blockAuthor() {
      if (!this.requireLoginForAction('block_author')) return;
      if (!this.data.authorId) {
        wx.showToast({ title: '暂无作者信息', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '拉黑作者',
        content: '拉黑后将自动取消双方关注，并限制后续互动，确定拉黑吗？',
        success: async ({ confirm }) => {
          if (!confirm) return;
          try {
            await socialApi.blockUser({
              userId: this.data.authorId,
              reason: '从题目详情拉黑作者',
            });
            this.setData({ authorFollowing: false });
            wx.showToast({ title: '已拉黑', icon: 'none' });
          } catch (e) {
            handleApiError(e, { fallbackMessage: '操作失败' });
          }
        },
      });
    },

    onShareActionSheetClose() {
      this.setData({ showShareActionSheet: false });
    },

    showCustomGuide(channel = SHARE_CHANNEL.TIMELINE) {
      const isTimeline = channel === SHARE_CHANNEL.TIMELINE;
      this.setData({
        showCustomGuide: true,
        shareGuideChannel: channel,
        shareGuideTitle: isTimeline ? '分享到朋友圈' : '分享给微信好友',
        shareGuideStep2: isTimeline ? '选择「分享到朋友圈」' : '选择「转发」发送给好友',
      });
    },

    /** t-popup 遮罩/关闭：visible-change */
    onShareGuideVisibleChange(e) {
      const visible = e?.detail?.visible ?? e?.detail;
      if (visible === true) return;
      this.setData({ showCustomGuide: false });
    },

    /** 「知道了」按钮：直接关闭（勿复用 visible-change，tap.detail 是坐标对象） */
    onCloseShareGuide() {
      this.setData({ showCustomGuide: false });
    },

    applyShareCount(shareCount) {
      if (shareCount == null || Number.isNaN(Number(shareCount))) {
        const current = Number(this.data.questionDetail?.shareCount) || 0;
        this.setData({ 'questionDetail.shareCount': current + 1 });
        return;
      }
      this.setData({
        'questionDetail.shareCount': Math.max(0, Number(shareCount) || 0),
      });
    },

    async reportShareInitiate(channel) {
      const { ok, shareCount } = await trackQuestionShare({
        questionId: this.data.questionId,
        channel,
        action: SHARE_ACTION.INITIATE,
      });
      if (ok) {
        this.applyShareCount(shareCount);
      }
      return ok;
    },

    copyPathFallback(questionId) {
      const path = buildQuestionSharePath({
        questionId,
        channel: SHARE_CHANNEL.COPY,
      });
      wx.setClipboardData({
        data: path,
        success: () => {
          Message.warning({
            content: '短链生成失败，已复制小程序路径（仅开发者工具/内部可用）',
            duration: 3000,
          });
        },
        fail: () => {
          wx.showToast({ title: '生成链接失败，请稍后重试', icon: 'none' });
        },
      });
    },

    copyLink() {
      const questionId = this.data.questionId;
      if (!questionId) {
        wx.showToast({ title: '题目信息缺失', icon: 'none' });
        return;
      }

      let envVersion = 'release';
      try {
        if (typeof __wxConfig !== 'undefined' && __wxConfig && __wxConfig.envVersion) {
          envVersion = __wxConfig.envVersion;
        }
      } catch (e) {
        // ignore
      }

      wx.showLoading({ title: '生成链接…', mask: true });
      questionApi
        .getShareLink(questionId, {
          channel: SHARE_CHANNEL.COPY,
          envVersion,
          expireDays: 30,
        })
        .then((res) => {
          const data = unwrapData(res) || {};
          const link = data.urlLink || data.url_link;
          if (!link) {
            this.copyPathFallback(questionId);
            return;
          }
          wx.setClipboardData({
            data: link,
            success: () => {
              Message.success({
                content: '链接已复制，微信中打开即可阅读',
                duration: 2500,
              });
              this.reportShareInitiate(SHARE_CHANNEL.COPY);
            },
          });
        })
        .catch(() => {
          this.copyPathFallback(questionId);
        })
        .finally(() => {
          wx.hideLoading();
        });
    },

    shareToMoment() {
      this.showCustomGuide(SHARE_CHANNEL.TIMELINE);
    },
  },
});

export default questionShareBehavior;
