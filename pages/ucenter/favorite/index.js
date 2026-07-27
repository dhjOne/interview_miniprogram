import Message from 'tdesign-miniprogram/message/index';
import { questionApi, collectFolderApi, unwrapData, handleApiError } from '~/api/index';
import { QuestionParams, QuestionLikeOrCollectParams } from '~/api/param/param_question';
import { openPage } from '~/utils/router';

const app = getApp();

const FOLDER_TONES = ['rose', 'blue', 'teal', 'amber', 'violet', 'slate'];

function formatDateYMD(value) {
  if (value === undefined || value === null || value === '') return '—';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const mo = `${m[2]}`.padStart(2, '0');
    const d = `${m[3]}`.padStart(2, '0');
    return `${m[1]}-${mo}-${d}`;
  }
  const d = new Date(s.replace(/-/g, '/'));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10) || '—';
  const y = d.getFullYear();
  const mo = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function normalizeQuestionRow(row) {
  const isCollected = !!(row.isCollected ?? row.collected ?? true);
  const difficulty = row.difficulty ?? row.difficultyLevel;
  let difficultyTag = null;
  const n = Number(difficulty);
  if (n === 1) difficultyTag = { text: '简单', theme: 'success' };
  else if (n === 2) difficultyTag = { text: '中等', theme: 'warning' };
  else if (n === 3) difficultyTag = { text: '困难', theme: 'danger' };
  const rawTime =
    row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? row.createAt;
  const displayDate = formatDateYMD(rawTime);
  const viewCount = row.viewCount ?? row.view_count ?? 0;
  const commentCount = row.commentCount ?? row.comment_count ?? 0;
  const likeCount = row.likeCount ?? row.like_count ?? 0;
  return {
    ...row,
    isCollected,
    difficultyTag,
    displayDate,
    viewCount,
    commentCount,
    likeCount,
    collectFolderId: row.collectFolderId ?? row.collect_folder_id ?? null,
    collectFolderName: row.collectFolderName ?? row.collect_folder_name ?? '',
  };
}

function decorateFolders(list = []) {
  return list.map((item, index) => ({
    ...item,
    itemCount: item.itemCount ?? item.item_count ?? 0,
    isDefault: !!(item.isDefault ?? item.is_default),
    tone:
      item.isDefault || item.is_default
        ? 'rose'
        : FOLDER_TONES[(index % (FOLDER_TONES.length - 1)) + 1],
  }));
}

Page({
  data: {
    viewMode: 'folders',
    viewTabs: [
      { label: '分类', value: 'folders' },
      { label: '全部', value: 'questions' },
    ],
    folders: [],
    folderLoading: false,
    folderLoadAttempted: false,
    totalCollectCount: 0,

    activeFolderId: null,
    activeFolderName: '',
    activeFolderIsDefault: false,

    searchValue: '',
    sortType: 'default',
    sortChips: [
      { label: '综合', value: 'default' },
      { label: '最新', value: 'latest' },
      { label: '最热', value: 'hot' },
    ],
    questionList: [],
    totalCount: 0,
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    loadAttempted: false,

    pickerVisible: false,
    pickerMode: 'move',
    pickerFolderId: null,
    pickerQuestionId: null,

    manageFolderId: null,
    createVisible: false,
    createName: '',
    creating: false,
  },

  onShow() {
    if (this._skipShowRefresh) {
      this._skipShowRefresh = false;
      return;
    }
    this.refreshCurrentView();
  },

  onLoad() {
    this._skipShowRefresh = true;
    this.loadFolders();
  },

  onPullDownRefresh() {
    return this.refreshCurrentView();
  },

  onReachBottom() {
    if (this.data.viewMode === 'questions') {
      this.loadMore();
    }
  },

  refreshCurrentView() {
    if (this.data.viewMode === 'folders' && !this.data.activeFolderId) {
      return this.loadFolders();
    }
    return Promise.all([this.loadFolders({ silent: true }), this.loadQuestions(true)]);
  },

  onViewTabTap(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.viewMode) return;
    if (mode === 'folders') {
      this.setData(
        {
          viewMode: 'folders',
          activeFolderId: null,
          activeFolderName: '',
          activeFolderIsDefault: false,
          searchValue: '',
        },
        () => this.loadFolders(),
      );
      return;
    }
    this.setData(
      {
        viewMode: 'questions',
        activeFolderId: null,
        activeFolderName: '',
        activeFolderIsDefault: false,
      },
      () => this.loadQuestions(true),
    );
  },

  async loadFolders({ silent = false } = {}) {
    if (!silent) this.setData({ folderLoading: true });
    try {
      const res = await collectFolderApi.list();
      const folders = decorateFolders(unwrapData(res) || []);
      const totalCollectCount = folders.reduce((sum, f) => sum + (Number(f.itemCount) || 0), 0);
      this.setData({
        folders,
        totalCollectCount,
        folderLoadAttempted: true,
      });
    } catch (error) {
      console.error('收藏分类加载失败:', error);
      handleApiError(error, { fallbackMessage: '分类加载失败' });
      this.setData({ folderLoadAttempted: true });
    } finally {
      this.setData({ folderLoading: false });
      wx.stopPullDownRefresh();
    }
  },

  _sortParams() {
    const map = {
      default: ['sort_order', 'asc'],
      latest: ['created_at', 'desc'],
      hot: ['view_count', 'desc'],
    };
    return map[this.data.sortType] || map.default;
  },

  async loadQuestions(refresh = false) {
    if (this.data.loading) return;
    if (!refresh && !this.data.hasMore) return;

    const requestPage = refresh ? 1 : this.data.page + 1;
    this.setData({ loading: true });

    try {
      const title =
        this.data.searchValue && this.data.searchValue.trim() ? this.data.searchValue.trim() : null;
      const questionParams = new QuestionParams(
        title,
        null,
        null,
        'collected',
        this.data.activeFolderId,
      );
      const [sortField, order] = this._sortParams();
      questionParams.sortField = sortField;
      questionParams.order = order;
      questionParams.page = requestPage;
      questionParams.limit = this.data.pageSize;

      const response = await questionApi.getQuestionList(questionParams);
      const data = unwrapData(response) || {};
      const rawList = data.rows || [];
      const total = data.total || 0;
      const newList = rawList.map(normalizeQuestionRow);

      if (refresh) {
        this.setData({
          questionList: newList,
          totalCount: total,
          page: 1,
          hasMore: newList.length < total,
          loadAttempted: true,
        });
      } else {
        const merged = [...this.data.questionList, ...newList];
        this.setData({
          questionList: merged,
          totalCount: total,
          page: requestPage,
          hasMore: merged.length < total,
          loadAttempted: true,
        });
      }
    } catch (error) {
      console.error('收藏列表加载失败:', error);
      handleApiError(error, { fallbackMessage: '网络错误，请重试' });
      this.setData({ loadAttempted: true });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  onFolderTap(e) {
    const { id, name } = e.currentTarget.dataset;
    const isDefault =
      e.currentTarget.dataset.isDefault === true || e.currentTarget.dataset.isDefault === 'true';
    if (!id) return;
    this.setData(
      {
        viewMode: 'questions',
        activeFolderId: id,
        activeFolderName: name || '分类',
        activeFolderIsDefault: isDefault,
        searchValue: '',
      },
      () => this.loadQuestions(true),
    );
  },

  onBackToFolders() {
    this.setData(
      {
        viewMode: 'folders',
        activeFolderId: null,
        activeFolderName: '',
        activeFolderIsDefault: false,
        searchValue: '',
        questionList: [],
      },
      () => this.loadFolders(),
    );
  },

  onFolderLongPress(e) {
    const { id, name } = e.currentTarget.dataset;
    const isDefault =
      e.currentTarget.dataset.isDefault === true || e.currentTarget.dataset.isDefault === 'true';
    if (!id || isDefault) {
      if (isDefault) {
        wx.showToast({ title: '默认分类不可编辑', icon: 'none' });
      }
      return;
    }
    wx.showActionSheet({
      itemList: ['重命名', '删除分类'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.promptRenameFolder(id, name);
        } else if (res.tapIndex === 1) {
          this.confirmDeleteFolder(id, name);
        }
      },
    });
  },

  promptRenameFolder(id, name) {
    wx.showModal({
      title: '重命名分类',
      editable: true,
      placeholderText: '输入新名称',
      content: name || '',
      success: async (res) => {
        if (!res.confirm) return;
        const next = (res.content || '').trim();
        if (!next) {
          wx.showToast({ title: '名称不能为空', icon: 'none' });
          return;
        }
        try {
          await collectFolderApi.rename(id, { name: next });
          Message.success({
            context: this,
            offset: [20, 32],
            duration: 1600,
            content: '已重命名',
          });
          this.loadFolders();
          if (this.data.activeFolderId === id) {
            this.setData({ activeFolderName: next });
          }
        } catch (error) {
          handleApiError(error, { fallbackMessage: '重命名失败' });
        }
      },
    });
  },

  confirmDeleteFolder(id, name) {
    wx.showModal({
      title: '删除分类',
      content: `删除「${name}」后，其中的题目会移到「默认收藏」`,
      confirmColor: '#e34d59',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await collectFolderApi.remove(id);
          Message.success({
            context: this,
            offset: [20, 32],
            duration: 1600,
            content: '已删除分类',
          });
          if (this.data.activeFolderId === id) {
            this.onBackToFolders();
          } else {
            this.loadFolders();
          }
        } catch (error) {
          handleApiError(error, { fallbackMessage: '删除失败' });
        }
      },
    });
  },

  onShowCreateFolder() {
    this.setData({ createVisible: true, createName: '' });
  },

  onCreateNameInput(e) {
    this.setData({ createName: e.detail.value || '' });
  },

  onCloseCreate() {
    this.setData({ createVisible: false, createName: '' });
  },

  onCreateVisibleChange(e) {
    if (!e.detail?.visible) {
      this.onCloseCreate();
    }
  },

  async onConfirmCreate() {
    const name = (this.data.createName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }
    this.setData({ creating: true });
    try {
      await collectFolderApi.create({ name });
      this.setData({ createVisible: false, createName: '' });
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 1600,
        content: '分类已创建',
      });
      this.loadFolders();
    } catch (error) {
      handleApiError(error, { fallbackMessage: '创建失败' });
    } finally {
      this.setData({ creating: false });
    }
  },

  onSearchChange(e) {
    this.setData({ searchValue: e.detail.value || '' });
  },

  triggerSearch(keyword) {
    const value = (keyword ?? this.data.searchValue ?? '').trim();
    this.setData({ searchValue: value }, () => {
      this.loadQuestions(true);
    });
  },

  onSearchSubmit(e) {
    this.triggerSearch(e.detail?.value);
  },

  onSearchAction() {
    this.triggerSearch(this.data.searchValue);
  },

  onSearchClear() {
    this.setData({ searchValue: '' }, () => {
      this.loadQuestions(true);
    });
  },

  onSortTap(e) {
    const sort = e.currentTarget.dataset.sort;
    if (!sort || sort === this.data.sortType) return;
    this.setData({ sortType: sort }, () => {
      this.loadQuestions(true);
    });
  },

  loadMore() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadQuestions(false);
    }
  },

  async onCollect(e) {
    const questionId = e.currentTarget.dataset.id;
    const question = this.data.questionList.find((item) => item.id === questionId);
    if (!question) return;

    try {
      await questionApi.toggleCollect(
        new QuestionLikeOrCollectParams(questionId, null, !question.isCollected),
      );

      const isNowCollected = !question.isCollected;
      if (!isNowCollected) {
        const updatedList = this.data.questionList.filter((item) => item.id !== questionId);
        this.setData({
          questionList: updatedList,
          totalCount: Math.max(0, (this.data.totalCount || 1) - 1),
          totalCollectCount: Math.max(0, (this.data.totalCollectCount || 1) - 1),
        });
        this.loadFolders({ silent: true });
      } else {
        const updatedList = this.data.questionList.map((item) => {
          if (item.id === questionId) {
            return { ...item, isCollected: true };
          }
          return item;
        });
        this.setData({ questionList: updatedList });
      }
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 2000,
        content: question.isCollected ? '已取消收藏' : '收藏成功',
      });
    } catch (err) {
      console.error('收藏操作失败:', err);
      handleApiError(err, { fallbackMessage: '操作失败，请重试' });
    }
  },

  onFolderChipTap(e) {
    const { id, folderId, folderName } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({
      pickerVisible: true,
      pickerMode: 'move',
      pickerQuestionId: id,
      pickerFolderId: folderId || null,
    });
  },

  onPickerClose() {
    this.setData({
      pickerVisible: false,
      pickerQuestionId: null,
      pickerFolderId: null,
    });
  },

  async onPickerConfirm(e) {
    const { folderId, folderName } = e.detail || {};
    const questionId = this.data.pickerQuestionId;
    if (!questionId || !folderId) return;
    try {
      await questionApi.moveCollect({ questionId, folderId });
      this.setData({ pickerVisible: false, pickerQuestionId: null, pickerFolderId: null });

      if (this.data.activeFolderId && this.data.activeFolderId !== folderId) {
        const updatedList = this.data.questionList.filter((item) => item.id !== questionId);
        this.setData({
          questionList: updatedList,
          totalCount: Math.max(0, (this.data.totalCount || 1) - 1),
        });
      } else {
        const updatedList = this.data.questionList.map((item) => {
          if (item.id === questionId) {
            return {
              ...item,
              collectFolderId: folderId,
              collectFolderName: folderName || item.collectFolderName,
            };
          }
          return item;
        });
        this.setData({ questionList: updatedList });
      }
      this.loadFolders({ silent: true });
      Message.success({
        context: this,
        offset: [20, 32],
        duration: 1600,
        content: '已移动到「' + (folderName || '分类') + '」',
      });
    } catch (error) {
      handleApiError(error, { fallbackMessage: '移动失败' });
    }
  },

  onQuestionClick(e) {
    const questionId = e.currentTarget.dataset.id;
    const questionTitle = e.currentTarget.dataset.title || '';
    app.navigateToLogin({
      url: `/pages/question/detail/index?id=${questionId}&title=${encodeURIComponent(
        questionTitle,
      )}`,
    });
  },

  goBrowse() {
    openPage({ url: '/pages/category/index' });
  },
});
