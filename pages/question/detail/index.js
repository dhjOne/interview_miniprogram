import Message from 'tdesign-miniprogram/message/index';
import { questionApi, socialApi, handleApiError, unwrapData } from '~/api/index';
import { QuestionLikeOrCollectParams, QuestionParams } from '~/api/param/param_question';
import questionCommentsBehavior from './behaviors/comments';
import questionShareBehavior from './behaviors/share';
import {
  resolveAuthorAvatar,
  resolveAuthorDisplayName,
  resolveAuthorFollowing,
  resolveAuthorId,
  resolveCurrentUserId,
} from '~/utils/author';
import { trackQuestionBrowse } from '~/utils/practiceBrowse';
import {
  buildSharePanels,
  formatDisplayDate,
  normalizeQuestionDetail,
} from '~/utils/questionDetail';
import { processContentBlocks } from '~/utils/questionContentBlocks';
import { safeDecodeURIComponent } from '~/utils/questionList';
import { backPage, openPage, ensureLoginForAction, getCurrentPagePath } from '~/utils/router';
import { AppEvents } from '~/utils/eventBus';
import {
  ACTION_LOGIN_HINTS,
  ACTION_RESUME_TOASTS,
  consumePendingLoginAction,
} from '~/utils/pendingAction';
import {
  SHARE_ACTION,
  SHARE_CHANNEL,
  buildQuestionShareMessage,
  buildQuestionShareTimeline,
  parseShareEntry,
  resolveShareImageUrl,
  trackQuestionShare,
} from '~/utils/questionShare';

const { renderMarkdown } = require('../../../utils/towxmlLoader');
const app = getApp();

/**
 * 题目详情
 * - behaviors/share：分享面板、举报/拉黑
 * - behaviors/comments：评论列表与回复
 * - 本文件：详情加载/渲染、目录、关注、点赞收藏
 */
Page({
  behaviors: [questionShareBehavior, questionCommentsBehavior],

  data: {
    questionId: null,
    questionDetail: {},
    relatedQuestions: [],
    showActionBar: true,
    scrollTop: 0,

    categoryId: null,
    categoryName: '',
    catalogTitle: '题目目录',
    catalogList: [],
    catalogPage: 1,
    catalogPageSize: 30,
    catalogTotal: 0,
    catalogHasMore: true,
    catalogLoading: false,
    catalogLoadingMore: false,
    catalogLoaded: false,
    catalogSupportsPagination: true,
    showCatalog: false,

    authorId: '',
    authorDisplayName: '题目作者',
    authorFollowing: false,
    isSelfAuthor: false,

    loading: true,
    contentRendering: false,
    error: false,
    errorMessage: '',
    isEmpty: false,

    contentBlocks: [],
    blockStyles: {},
    currentTheme: 'default',

    isMarkdown: false,
    towxmlData: null,
    towxmlOptions: {
      theme: 'light',
      events: {
        tap: (e) => {
          const { dataset } = e.currentTarget;
          if (dataset.src) {
            wx.previewImage({
              current: dataset.src,
              urls: [dataset.src],
            });
          }
        },
        linktap: () => {},
      },
    },

    collectPickerVisible: false,
    collectPickerMode: 'collect',
    collectPickerFolderId: null,

    /** 访客态底栏提示 */
    isLoggedIn: false,
  },

  onLoad(options) {
    const { id, categoryId, categoryName, title } = options;
    if (!id) {
      this.setData({
        loading: false,
        error: true,
        errorMessage: '题目ID不能为空',
      });
      return;
    }

    const decodedCategoryName = safeDecodeURIComponent(categoryName);
    const decodedTitle = safeDecodeURIComponent(title);
    const shareEntry = parseShareEntry(options);

    this.setData({
      questionId: id,
      categoryId: categoryId || null,
      categoryName: decodedCategoryName,
      catalogTitle: decodedCategoryName || '题目目录',
      isLoggedIn: this.resolveLoginStatus(),
    });
    this._shareEntry = shareEntry;

    if (decodedTitle) {
      wx.setNavigationBarTitle({ title: decodedTitle });
    }

    this.loadQuestionDetail();
    this.reportShareOpenIfNeeded();
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  /** 从分享卡片/链接进入时上报回流打开 */
  reportShareOpenIfNeeded() {
    const entry = this._shareEntry;
    if (!entry || !this.data.questionId) return;
    trackQuestionShare({
      questionId: this.data.questionId,
      channel: entry.channel,
      action: SHARE_ACTION.OPEN,
      sharerId: entry.sharerId,
    });
  },

  onShareAppMessage() {
    const detail = this.data.questionDetail || {};
    const payload = buildQuestionShareMessage({
      title: detail.title,
      questionId: this.data.questionId || detail.id,
      channel: SHARE_CHANNEL.FRIEND,
      imageUrl: resolveShareImageUrl(detail),
    });
    // 右上角转发 / 系统分享菜单触发时上报（无法确认是否真正发出）
    if (typeof this.reportShareInitiate === 'function') {
      this.reportShareInitiate(SHARE_CHANNEL.FRIEND);
    } else {
      trackQuestionShare({
        questionId: this.data.questionId,
        channel: SHARE_CHANNEL.FRIEND,
        action: SHARE_ACTION.INITIATE,
      });
    }
    return payload;
  },

  onShareTimeline() {
    const detail = this.data.questionDetail || {};
    const payload = buildQuestionShareTimeline({
      title: detail.title,
      questionId: this.data.questionId || detail.id,
      imageUrl: resolveShareImageUrl(detail),
    });
    if (typeof this.reportShareInitiate === 'function') {
      this.reportShareInitiate(SHARE_CHANNEL.TIMELINE);
    } else {
      trackQuestionShare({
        questionId: this.data.questionId,
        channel: SHARE_CHANNEL.TIMELINE,
        action: SHARE_ACTION.INITIATE,
      });
    }
    return payload;
  },

  resolveLoginStatus() {
    if (app && typeof app.checkLoginStatus === 'function' && app.checkLoginStatus()) {
      return true;
    }
    try {
      return !!(wx.getStorageSync('access_token') && wx.getStorageSync('user_info'));
    } catch (e) {
      return false;
    }
  },

  syncLoginState() {
    const isLoggedIn = this.resolveLoginStatus();
    if (isLoggedIn !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn });
    }
    return isLoggedIn;
  },

  /** 访客底栏「去登录」 */
  onGuestLoginTap() {
    ensureLoginForAction({
      app,
      returnUrl: getCurrentPagePath(),
      content: '登录后即可点赞、收藏与评论',
    });
  },

  /**
   * 登录回跳续做成功时的 Toast（无续做标记则返回 fallback）
   * @param {string} type
   * @param {string} [fallback]
   */
  consumeResumeToast(type, fallback = '') {
    if (this._resumeActionType !== type) return fallback;
    this._resumeActionType = null;
    return ACTION_RESUME_TOASTS[type] || fallback;
  },

  /** 仅打开面板类续做：直接提示 */
  flushResumeToast(type) {
    const content = this.consumeResumeToast(type);
    if (!content) return;
    Message.success({ content, duration: 2000 });
  },

  onShow() {
    this.syncLoginState();
    // 登录回跳等场景：页面已挂载但详情未成功展示时自动重试
    if (
      this.data.questionId &&
      !this.data.loading &&
      !this._detailLoading &&
      !this.data.error &&
      !this.data.isEmpty &&
      !this.data.questionDetail?.id &&
      !this.data.questionDetail?.title
    ) {
      this.loadQuestionDetail();
    }
    this.resumePendingLoginAction();
  },

  onPullDownRefresh() {
    return this.refreshPage();
  },

  async loadQuestionDetail() {
    if (this._detailLoading) return;
    this._detailLoading = true;
    try {
      this.setData({
        loading: true,
        contentRendering: false,
        error: false,
        isEmpty: false,
        isMarkdown: false,
        towxmlData: null,
      });

      const questionParams = new QuestionParams(null, null, this.data.questionId);
      const response = await questionApi.getQuestionDetail(questionParams);
      const detailPayload = unwrapData(response) || response?.data || null;

      if (detailPayload && (detailPayload.id || detailPayload.title || detailPayload.contentType)) {
        const questionDetail = normalizeQuestionDetail(detailPayload);
        const isMarkdownContent = questionDetail.contentType === 'markdown';

        const authorId = resolveAuthorId(questionDetail);
        const currentUserId = resolveCurrentUserId();
        const isSelfAuthor = !!(currentUserId && authorId && currentUserId === authorId);
        const authorDisplayName = resolveAuthorDisplayName(questionDetail, '题目作者');
        const patch = {
          questionDetail,
          loading: false,
          contentRendering: isMarkdownContent,
          isMarkdown: isMarkdownContent,
          authorId,
          authorDisplayName,
          authorFollowing: isSelfAuthor ? false : resolveAuthorFollowing(questionDetail),
          isSelfAuthor,
          sharePanels: buildSharePanels(isSelfAuthor),
          catalogLoaded: false,
          comments: [],
          commentPage: 1,
          commentTotal: 0,
          commentHasMore: true,
          commentLoading: false,
          commentLoadingMore: false,
          replyLoadingIds: {},
          expandedReplyIds: {},
          commentCount: questionDetail.commentCount ?? 0,
        };
        if (!this.data.categoryId && questionDetail.categoryId) {
          patch.categoryId = questionDetail.categoryId;
        }
        if (questionDetail.categoryName) {
          patch.catalogTitle = questionDetail.categoryName;
        }
        if (questionDetail.title) {
          wx.setNavigationBarTitle({ title: questionDetail.title });
        }

        this.setData(patch);

        trackQuestionBrowse({
          id: questionDetail.id ?? this.data.questionId,
          title: questionDetail.title,
        }).catch(() => {});

        // 详情已带 commentCount 时跳过额外统计请求
        if (questionDetail.commentCount == null) {
          this.loadCommentCount();
        }

        if (isMarkdownContent) {
          this.renderMarkdownWithTowxml(questionDetail);
        } else {
          this.renderWithContentBlocks(questionDetail);
        }

        this.flushPendingActionAfterDetailReady();
      } else {
        this.setData({
          loading: false,
          contentRendering: false,
          error: false,
          isEmpty: true,
        });
      }
    } catch (error) {
      console.error('加载题目详情失败:', error);
      this.setData({
        loading: false,
        contentRendering: false,
        error: true,
        errorMessage: '网络错误，请重试',
      });
    } finally {
      this._detailLoading = false;
      wx.stopPullDownRefresh();
    }
  },

  renderWithContentBlocks(questionDetail) {
    const contentBlocks = questionDetail.contentList || [];
    this.setData({
      contentBlocks: processContentBlocks(contentBlocks),
      contentRendering: false,
    });
  },

  renderMarkdownWithTowxml(questionDetail) {
    const markdownContent = questionDetail.content || questionDetail.previewFullContent || '';

    if (!markdownContent) {
      console.warn('Markdown 内容为空');
      this.setData({ contentBlocks: [], contentRendering: false });
      return;
    }

    renderMarkdown(markdownContent, {
      theme: this.data.towxmlOptions.theme,
      events: this.data.towxmlOptions.events,
      base: 'https://example.com',
      highlight: true,
      showImageMenu: true,
      customizeStyle: true,
    })
      .then((towxmlData) => {
        if (!towxmlData) {
          throw new Error('towxml 解析结果为空');
        }
        this.setData({
          towxmlData,
          contentBlocks: [],
          contentRendering: false,
        });
      })
      .catch((error) => {
        console.error('解析 markdown 失败:', error);
        if (questionDetail.contentList && questionDetail.contentList.length > 0) {
          console.warn('Markdown 解析失败，尝试使用 contentList 渲染');
          this.renderWithContentBlocks(questionDetail);
        } else {
          this.setData({
            contentRendering: false,
            error: true,
            errorMessage: '内容解析失败',
          });
        }
      });
  },

  _resetDetailTransientState() {
    return {
      loading: true,
      contentRendering: false,
      error: false,
      errorMessage: '',
      isEmpty: false,
      isMarkdown: false,
      towxmlData: null,
      contentBlocks: [],
      catalogLoaded: false,
      catalogList: [],
      catalogPage: 1,
      catalogTotal: 0,
      catalogHasMore: true,
      catalogLoadingMore: false,
      showCatalog: false,
      showCommentPanel: false,
      comments: [],
      commentPage: 1,
      commentTotal: 0,
      commentHasMore: true,
      commentLoading: false,
      commentLoadingMore: false,
      replyLoadingIds: {},
      expandedReplyIds: {},
    };
  },

  refreshPage() {
    this.setData(this._resetDetailTransientState());
    return this.loadQuestionDetail();
  },

  retryLoad() {
    this.setData(this._resetDetailTransientState());
    this.loadQuestionDetail();
  },

  goBack() {
    backPage();
  },

  async loadCatalog(refresh = true) {
    const categoryId = this.data.categoryId;

    if (
      !refresh &&
      (this.data.catalogLoadingMore || !this.data.catalogHasMore || this.data.catalogLoading)
    ) {
      return;
    }

    if (!categoryId) {
      if (!refresh) return;
      this.setData({ catalogLoading: true, catalogList: [], catalogPage: 1 });
      try {
        const response = await questionApi.getRelatedQuestions(
          new QuestionParams(null, null, this.data.questionId),
        );
        let rows = response.data?.rows ?? response.data ?? [];
        if (!Array.isArray(rows)) rows = [];

        const catalogList = rows.map((row, index) => ({
          id: row.id,
          title: row.title || `题目 ${index + 1}`,
          index: index + 1,
          displayDate: formatDisplayDate(row.updatedAt || row.createdAt),
        }));

        this.setData({
          catalogList,
          catalogPage: 1,
          catalogTotal: catalogList.length,
          catalogHasMore: false,
          catalogSupportsPagination: false,
          catalogLoaded: true,
          catalogTitle: this.data.catalogTitle || this.data.categoryName || '相关题目',
        });
      } catch (e) {
        console.error('加载目录失败', e);
        this.setData({ catalogList: [], catalogLoaded: true, catalogHasMore: false });
      } finally {
        this.setData({ catalogLoading: false, catalogLoadingMore: false });
      }
      return;
    }

    const nextPage = refresh ? 1 : this.data.catalogPage + 1;
    const pageSize = this.data.catalogPageSize;

    if (refresh) {
      this.setData({
        catalogLoading: true,
        catalogList: [],
        catalogPage: 1,
        catalogTotal: 0,
        catalogHasMore: true,
        catalogSupportsPagination: true,
      });
    } else {
      this.setData({ catalogLoadingMore: true });
    }

    try {
      const questionParams = new QuestionParams(null, categoryId, null);
      questionParams.page = nextPage;
      questionParams.limit = pageSize;
      questionParams.sortField = 'sort_order';
      questionParams.order = 'asc';
      const response = await questionApi.getQuestionList(questionParams);

      const rawRows = response.data?.rows || [];
      const parsedTotal = Number(response.data?.total);
      const hasTotal =
        response.data?.total !== undefined &&
        response.data?.total !== null &&
        !Number.isNaN(parsedTotal);
      const baseIndex = (nextPage - 1) * pageSize;
      const newChunk = rawRows.map((row, index) => ({
        id: row.id,
        title: row.title || `题目 ${baseIndex + index + 1}`,
        index: baseIndex + index + 1,
        displayDate: formatDisplayDate(row.updatedAt || row.createdAt),
      }));
      const catalogList = refresh ? newChunk : [...this.data.catalogList, ...newChunk];
      const catalogHasMore = hasTotal
        ? catalogList.length < parsedTotal
        : rawRows.length >= pageSize;

      this.setData({
        catalogList,
        catalogPage: nextPage,
        catalogTotal: hasTotal ? parsedTotal : catalogList.length,
        catalogHasMore,
        catalogLoaded: true,
        catalogTitle: this.data.catalogTitle || this.data.categoryName || '相关题目',
      });
    } catch (e) {
      console.error('加载目录失败', e);
      if (refresh) {
        this.setData({ catalogList: [], catalogLoaded: true, catalogHasMore: false });
      }
    } finally {
      this.setData({ catalogLoading: false, catalogLoadingMore: false });
    }
  },

  loadMoreCatalog() {
    if (this.data.catalogSupportsPagination) {
      this.loadCatalog(false);
    }
  },

  onOpenCatalog() {
    this.setData({ showCatalog: true });
    if (!this.data.catalogLoaded) {
      this.loadCatalog();
    }
  },

  onCatalogVisibleChange(e) {
    const visible = e.detail?.visible ?? e.detail;
    if (!visible) {
      this.setData({ showCatalog: false });
    }
  },

  onCatalogItemTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || String(id) === String(this.data.questionId)) {
      this.setData({ showCatalog: false });
      return;
    }
    const item = this.data.catalogList.find((row) => String(row.id) === String(id));
    this.setData({
      questionId: id,
      showCatalog: false,
      ...this._resetDetailTransientState(),
      showCommentPanel: false,
    });
    if (item?.title) {
      wx.setNavigationBarTitle({ title: item.title });
    }
    this.loadQuestionDetail();
  },

  onAuthorTap() {
    const { questionDetail, authorId, authorDisplayName } = this.data;
    const avatar = resolveAuthorAvatar(questionDetail);

    if (!authorId) {
      wx.showToast({ title: '暂无作者信息', icon: 'none' });
      return;
    }

    const qs = [
      `userId=${encodeURIComponent(authorId)}`,
      `nickname=${encodeURIComponent(authorDisplayName || '')}`,
    ];
    if (avatar) {
      qs.push(`avatar=${encodeURIComponent(avatar)}`);
    }
    openPage({
      url: `/pages/ucenter/profile/index?${qs.join('&')}`,
    });
  },

  /**
   * 未登录轻提示；确认后去登录，回跳后续做。
   * @param {string} actionType
   * @param {Object} [payload]
   */
  requireLoginForAction(actionType, payload = {}) {
    return ensureLoginForAction({
      app,
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

  resumePendingLoginAction() {
    if (!app.checkLoginStatus || !app.checkLoginStatus()) return;
    if (this._resumingPendingAction) return;
    const questionId = String(this.data.questionId || '');
    if (!questionId) return;

    const action = consumePendingLoginAction(
      (item) => item.page === 'question_detail' && String(item.questionId || '') === questionId,
    );
    if (!action) return;

    if (this.data.loading || this._detailLoading || !this.data.questionDetail?.id) {
      this._pendingActionAfterLoad = action;
      return;
    }

    this._resumingPendingAction = true;
    setTimeout(() => {
      this._resumingPendingAction = false;
      this.runPendingLoginAction(action);
    }, 320);
  },

  flushPendingActionAfterDetailReady() {
    const action = this._pendingActionAfterLoad;
    if (!action) return;
    this._pendingActionAfterLoad = null;
    if (!app.checkLoginStatus || !app.checkLoginStatus()) return;
    setTimeout(() => this.runPendingLoginAction(action), 200);
  },

  runPendingLoginAction(action) {
    if (!action || !action.type) return;
    this._resumeActionType = action.type;
    const payload = action.payload || {};
    switch (action.type) {
      case 'like':
        this.onLike();
        break;
      case 'collect':
        this.onCollect();
        break;
      case 'follow':
        this.onToggleFollow();
        break;
      case 'comment_submit': {
        const patch = {
          commentText: payload.content || '',
          showCommentPanel: true,
        };
        if (payload.replyParentId) {
          patch.replyParentId = payload.replyParentId;
          patch.replyRootId = payload.replyRootId || payload.replyParentId;
          patch.replyTargetName = payload.replyTargetName || '';
          patch.commentPlaceholder = payload.replyTargetName
            ? `回复 @${payload.replyTargetName}`
            : '说点什么...';
        }
        this.setData(patch, () => {
          if (typeof this.onSubmitComment === 'function') {
            this.onSubmitComment();
          }
        });
        break;
      }
      case 'comment_like':
        if (payload.commentId && typeof this.onLikeComment === 'function') {
          this.onLikeComment({
            currentTarget: { dataset: { id: payload.commentId } },
          });
        }
        break;
      case 'comment_reply':
        if (payload.id && typeof this.onReplyComment === 'function') {
          if (typeof this.onOpenComments === 'function') {
            this.onOpenComments();
          }
          this.onReplyComment({
            currentTarget: {
              dataset: {
                id: payload.id,
                name: payload.name,
                rootId: payload.rootId,
                content: payload.content,
              },
            },
          });
          this.flushResumeToast('comment_reply');
        }
        break;
      case 'comment_report':
        if (payload.id && typeof this.onReportComment === 'function') {
          this.onReportComment({
            currentTarget: {
              dataset: {
                id: payload.id,
                userId: payload.userId,
                content: payload.content,
              },
            },
          });
          this.flushResumeToast('comment_report');
        }
        break;
      case 'report_question':
        if (typeof this.reportQuestion === 'function') this.reportQuestion();
        break;
      case 'report_author':
        if (typeof this.reportAuthor === 'function') this.reportAuthor();
        break;
      case 'block_author':
        if (typeof this.blockAuthor === 'function') this.blockAuthor();
        this.flushResumeToast('block_author');
        break;
      case 'memo':
        if (typeof this.createInterviewMemo === 'function') this.createInterviewMemo();
        this.flushResumeToast('memo');
        break;
      default:
        this._resumeActionType = null;
        break;
    }
  },

  async onToggleFollow() {
    if (this.data.isSelfAuthor) {
      return;
    }
    if (!this.requireLoginForAction('follow')) return;

    const nextFollowing = !this.data.authorFollowing;

    if (!this.data.authorId) {
      this.setData({ authorFollowing: nextFollowing });
      const toastTitle = this.consumeResumeToast(
        'follow',
        nextFollowing ? '已关注（待后端同步）' : '已取消关注',
      );
      wx.showToast({
        title: toastTitle,
        icon: 'none',
      });
      return;
    }
    try {
      await socialApi.toggleFollow({
        userId: this.data.authorId,
        follow: nextFollowing,
      });
      this.setData({ authorFollowing: nextFollowing });
      Message.success({
        content: this.consumeResumeToast('follow', nextFollowing ? '已关注作者' : '已取消关注'),
        duration: 2000,
      });
    } catch (e) {
      console.warn('关注作者失败', e);
      this._resumeActionType = null;
      handleApiError(e, { fallbackMessage: '操作失败' });
    }
  },

  /** 通知列表页增量更新，避免返回时整表重拉 */
  emitQuestionUpdated(patch = {}) {
    const id = this.data.questionId;
    if (id == null || !app.eventBus) return;
    const detail = this.data.questionDetail || {};
    app.eventBus.emit(AppEvents.QUESTION_UPDATED, {
      id,
      liked: detail.liked,
      likeCount: detail.likeCount,
      isCollected: !!(detail.collected ?? detail.isCollected),
      collectCount: detail.collectCount,
      commentCount: this.data.commentCount ?? detail.commentCount,
      ...patch,
    });
  },

  async onLike() {
    if (this.data.error || this.data.isEmpty) return;
    if (!this.requireLoginForAction('like')) return;

    const { questionDetail } = this.data;
    const liked = !!questionDetail.liked;

    try {
      const likeQuestion = new QuestionLikeOrCollectParams(this.data.questionId, !liked, null);
      await questionApi.toggleLike(likeQuestion);
      const likeCount = liked
        ? Math.max(0, (questionDetail.likeCount || 0) - 1)
        : (questionDetail.likeCount || 0) + 1;
      this.setData({
        'questionDetail.liked': !liked,
        'questionDetail.likeCount': likeCount,
      });
      this.emitQuestionUpdated({ liked: !liked, likeCount });
      Message.success({
        content: this.consumeResumeToast('like', liked ? '已取消点赞' : '点赞成功'),
        duration: 2000,
      });
    } catch (error) {
      console.error('点赞操作失败:', error);
      this._resumeActionType = null;
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    }
  },

  async onCollect() {
    if (this.data.error || this.data.isEmpty) return;
    if (!this.requireLoginForAction('collect')) return;

    this.flushResumeToast('collect');

    const { questionDetail } = this.data;
    const collected = !!(questionDetail.collected ?? questionDetail.isCollected);

    if (collected) {
      wx.showActionSheet({
        itemList: ['更换分类', '取消收藏'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.setData({
              collectPickerVisible: true,
              collectPickerMode: 'move',
              collectPickerFolderId: questionDetail.collectFolderId || null,
            });
          } else if (res.tapIndex === 1) {
            this.uncollectQuestion();
          }
        },
      });
      return;
    }

    this.setData({
      collectPickerVisible: true,
      collectPickerMode: 'collect',
      collectPickerFolderId: questionDetail.collectFolderId || null,
    });
  },

  onCollectPickerClose() {
    this.setData({ collectPickerVisible: false });
  },

  async onCollectPickerConfirm(e) {
    const { folderId, folderName, mode } = e.detail || {};
    if (!folderId) return;

    const { questionDetail } = this.data;
    const collected = !!(questionDetail.collected ?? questionDetail.isCollected);

    try {
      if (mode === 'move' || collected) {
        await questionApi.moveCollect({
          questionId: this.data.questionId,
          folderId,
        });
        this.setData({
          collectPickerVisible: false,
          'questionDetail.collectFolderId': folderId,
          'questionDetail.collectFolderName': folderName || '',
        });
        Message.success({
          content: e.detail?.created
            ? '已新建并移动到「' + (folderName || '分类') + '」'
            : '已移动到「' + (folderName || '分类') + '」',
          duration: 2000,
        });
        return;
      }

      const collectQuestion = new QuestionLikeOrCollectParams(
        this.data.questionId,
        null,
        true,
        folderId,
      );
      await questionApi.toggleCollect(collectQuestion);
      this.setData({
        collectPickerVisible: false,
        'questionDetail.collected': true,
        'questionDetail.collectCount': (questionDetail.collectCount || 0) + 1,
        'questionDetail.collectFolderId': folderId,
        'questionDetail.collectFolderName': folderName || '',
      });
      this.emitQuestionUpdated({ isCollected: true });
      Message.success({
        content: e.detail?.created
          ? '已新建并收藏到「' + (folderName || '分类') + '」'
          : '已收藏到「' + (folderName || '默认收藏') + '」',
        duration: 2000,
      });
    } catch (error) {
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    }
  },

  async uncollectQuestion() {
    const { questionDetail } = this.data;
    try {
      const collectQuestion = new QuestionLikeOrCollectParams(this.data.questionId, null, false);
      await questionApi.toggleCollect(collectQuestion);
      this.setData({
        'questionDetail.collected': false,
        'questionDetail.collectCount': Math.max(0, (questionDetail.collectCount || 0) - 1),
        'questionDetail.collectFolderId': null,
        'questionDetail.collectFolderName': '',
      });
      this.emitQuestionUpdated({ isCollected: false });
      Message.success({
        content: '已取消收藏',
        duration: 2000,
      });
    } catch (error) {
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    }
  },

  onBlockTap(event) {
    const { blockType } = event.currentTarget.dataset;
    switch (blockType) {
      case 'code':
      case 'image':
      default:
        break;
    }
  },

  copyCode(event) {
    const content = event.currentTarget.dataset.content;
    wx.setClipboardData({
      data: content,
      success: () => {
        Message.success({
          content: '代码已复制到剪贴板',
          duration: 2000,
        });
      },
    });
  },
});
