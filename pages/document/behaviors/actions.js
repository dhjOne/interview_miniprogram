import { questionApi, handleApiError } from '~/api/index';
import { openPage } from '~/utils/router';

const app = getApp();

/**
 * 发布文档列表：卡片操作菜单与跳转
 * 依赖页面：loadDocList
 */
const documentActionsBehavior = Behavior({
  data: {
    actionsVisible: false,
    currentDocId: null,
    shareTitle: '',
    currentDocStatus: '',
  },

  methods: {
    onOpenActions(e) {
      const { id } = e.currentTarget.dataset;
      const doc = this.data.docList.find((item) => item.id == id);
      const shareTitle = doc ? doc.title || '文档' : '文档';
      const currentDocStatus = doc ? doc.status : '';
      this.setData({
        actionsVisible: true,
        currentDocId: id,
        shareTitle,
        currentDocStatus,
      });
    },

    onCloseActions() {
      this.setData({
        actionsVisible: false,
        currentDocId: null,
        shareTitle: '',
        currentDocStatus: '',
      });
    },

    onActionsPopupVisibleChange(e) {
      if (e.detail && e.detail.visible === false) {
        this.onCloseActions();
      }
    },

    onDocAction(e) {
      const { action } = e.currentTarget.dataset;
      const { currentDocId } = this.data;

      switch (action) {
        case 'edit':
          this.editDoc(currentDocId);
          break;
        case 'delete':
          this.deleteDoc(currentDocId);
          break;
        case 'preview':
          this.previewDoc(currentDocId);
          break;
        default:
          break;
      }

      this.onCloseActions();
    },

    editDoc(id) {
      if (id === undefined || id === null || id === '') return;
      wx.setStorageSync('release_edit_doc_id', String(id));
      openPage({
        url: `/pages/document/edit/index?id=${encodeURIComponent(id)}`,
        fail(res) {
          console.error('跳转失败', res);
        },
      });
    },

    async deleteDoc(id) {
      if (id === undefined || id === null || id === '') return;
      wx.showModal({
        title: '确认删除',
        content: '删除后无法恢复，确定要删除吗？',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await questionApi.deletePublishDoc(id);
            wx.showToast({
              title: '已删除',
              icon: 'success',
            });
            this.loadDocList(true);
          } catch (error) {
            handleApiError(error, { fallbackMessage: '删除失败' });
          }
        },
      });
    },

    previewDoc(id) {
      if (id === undefined || id === null || id === '') return;
      openPage({
        url: `/pages/document/preview/index?id=${encodeURIComponent(id)}`,
      });
    },

    shareDoc(id) {
      if (id === undefined || id === null || id === '') return;
      openPage({
        url: `/pages/document/preview/index?id=${encodeURIComponent(id)}&share=1`,
      });
    },

    onCreateDoc() {
      try {
        wx.removeStorageSync('release_edit_doc_id');
      } catch (e) {
        // ignore
      }
      app.navigateToLogin({
        url: `/pages/publish/index`,
        fail(res) {
          console.error('跳转失败', res);
        },
      });
    },

    onDocClick(e) {
      const { id } = e.currentTarget.dataset;
      app.navigateToLogin({
        url: `/pages/question/detail/index?id=${id}`,
      });
    },

    onShareAppMessage() {
      const id = this.data.currentDocId;
      const title = this.data.shareTitle || '文档';
      return {
        title,
        path: id
          ? `pages/document/preview/index?id=${encodeURIComponent(id)}`
          : 'pages/document/index',
      };
    },
  },
});

export default documentActionsBehavior;
