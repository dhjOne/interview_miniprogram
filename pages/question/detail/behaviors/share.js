import Message from 'tdesign-miniprogram/message/index';
import { socialApi, handleApiError } from '~/api/index';
import { buildSharePanels } from '~/utils/questionDetail';

/**
 * 题目详情：分享面板、复制链接、举报/拉黑作者
 * 依赖页面提供：questionId / authorId / authorDisplayName / questionDetail / refreshPage
 */
const questionShareBehavior = Behavior({
  data: {
    showShareActionSheet: false,
    showCustomGuide: false,
    sharePanels: buildSharePanels(false),
  },

  methods: {
    onShare() {
      this.setData({ showShareActionSheet: true });
    },

    onShareOptionTap(event) {
      const { value } = event.currentTarget.dataset;
      if (!value) return;

      this.setData({ showShareActionSheet: false });
      this.handleShareAction(value);
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
        case 'wechat':
          setTimeout(() => {
            this.showCustomGuide();
          }, 280);
          break;
        case 'moment':
          this.shareToMoment();
          break;
        case 'refresh':
          this.refreshPage();
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

    /** 兼容旧 ActionSheet */
    onShareOptionSelect(event) {
      const { selected } = event.detail;
      const flatItems = (this.data.sharePanels || []).flatMap((panel) => panel.items || []);
      const option = flatItems[selected.index];
      if (!option) return;

      this.setData({ showShareActionSheet: false });
      this.handleShareAction(option.value);
    },

    async reportQuestion() {
      try {
        await socialApi.submitReport({
          targetType: 'QUESTION',
          targetId: this.data.questionId,
          targetUserId: this.data.authorId || undefined,
          targetTitle: this.data.questionDetail.title,
          reasonType: 'OTHER',
          reason: '题目内容举报',
        });
        wx.showToast({ title: '举报已提交', icon: 'none' });
      } catch (e) {
        handleApiError(e, { fallbackMessage: '提交失败' });
      }
    },

    async reportAuthor() {
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
        wx.showToast({ title: '举报已提交', icon: 'none' });
      } catch (e) {
        handleApiError(e, { fallbackMessage: '提交失败' });
      }
    },

    blockAuthor() {
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

    showCustomGuide() {
      this.setData({ showCustomGuide: true });
    },

    onCloseCustomGuide(e) {
      if (e && e.detail !== undefined) {
        const visible = e.detail?.visible ?? e.detail;
        if (visible) return;
      }
      this.setData({ showCustomGuide: false });
    },

    copyLink() {
      const link = `pages/question/detail/index?id=${this.data.questionId}`;
      wx.setClipboardData({
        data: link,
        success: () => {
          Message.success({
            content: '链接已复制到剪贴板',
            duration: 2000,
          });
        },
      });
    },

    shareToMoment() {
      this.setData({ showCustomGuide: true });
    },
  },
});

export default questionShareBehavior;
