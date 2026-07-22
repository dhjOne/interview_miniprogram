import Message from 'tdesign-miniprogram/message/index';
import { questionApi, socialApi, handleApiError } from '~/api/index';
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
import { backPage, openPage } from '~/utils/router';

const { renderMarkdown } = require('../../../utils/towxmlLoader');

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

    this.setData({
      questionId: id,
      categoryId: categoryId || null,
      categoryName: decodedCategoryName,
      catalogTitle: decodedCategoryName || '题目目录',
    });

    if (decodedTitle) {
      wx.setNavigationBarTitle({ title: decodedTitle });
    }

    this.loadQuestionDetail();
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
    });
  },

  onPullDownRefresh() {
    return this.refreshPage();
  },

  async loadQuestionDetail() {
    try {
      this.setData({
        loading: true,
        error: false,
        isEmpty: false,
        isMarkdown: false,
        towxmlData: null,
      });

      const questionParams = new QuestionParams(null, null, this.data.questionId);
      const response = await questionApi.getQuestionDetail(questionParams);

      if (response.data) {
        const questionDetail = normalizeQuestionDetail(response.data);
        const isMarkdownContent = questionDetail.contentType === 'markdown';

        const authorId = resolveAuthorId(questionDetail);
        const currentUserId = resolveCurrentUserId();
        const isSelfAuthor = !!(currentUserId && authorId && currentUserId === authorId);
        const authorDisplayName = resolveAuthorDisplayName(questionDetail, '题目作者');
        const patch = {
          questionDetail,
          loading: false,
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

        this.setData(patch);

        trackQuestionBrowse({
          id: questionDetail.id ?? this.data.questionId,
          title: questionDetail.title,
        }).catch(() => {});

        this.loadCommentCount();

        if (isMarkdownContent) {
          this.renderMarkdownWithTowxml(questionDetail);
        } else {
          this.renderWithContentBlocks(questionDetail);
        }
      } else {
        this.setData({
          loading: false,
          error: false,
          isEmpty: true,
        });
      }
    } catch (error) {
      console.error('加载题目详情失败:', error);
      this.setData({
        loading: false,
        error: true,
        errorMessage: '网络错误，请重试',
      });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  renderWithContentBlocks(questionDetail) {
    const contentBlocks = questionDetail.contentList || [];
    this.setData({
      contentBlocks: processContentBlocks(contentBlocks),
    });
  },

  renderMarkdownWithTowxml(questionDetail) {
    const markdownContent = questionDetail.content || questionDetail.previewFullContent || '';

    if (!markdownContent) {
      console.warn('Markdown 内容为空');
      this.setData({ contentBlocks: [] });
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
        });
      })
      .catch((error) => {
        console.error('解析 markdown 失败:', error);
        if (questionDetail.contentList && questionDetail.contentList.length > 0) {
          console.warn('Markdown 解析失败，尝试使用 contentList 渲染');
          this.renderWithContentBlocks(questionDetail);
        } else {
          this.setData({
            error: true,
            errorMessage: '内容解析失败',
          });
        }
      });
  },

  _resetDetailTransientState() {
    return {
      loading: true,
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

  async onToggleFollow() {
    if (this.data.isSelfAuthor) {
      return;
    }

    const nextFollowing = !this.data.authorFollowing;

    if (!this.data.authorId) {
      this.setData({ authorFollowing: nextFollowing });
      wx.showToast({
        title: nextFollowing ? '已关注（待后端同步）' : '已取消关注',
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
        content: nextFollowing ? '已关注作者' : '已取消关注',
        duration: 2000,
      });
    } catch (e) {
      console.warn('关注作者失败', e);
      handleApiError(e, { fallbackMessage: '操作失败' });
    }
  },

  async onLike() {
    if (this.data.error || this.data.isEmpty) return;

    const { questionDetail } = this.data;
    const liked = !!questionDetail.liked;

    try {
      const likeQuestion = new QuestionLikeOrCollectParams(this.data.questionId, !liked, null);
      await questionApi.toggleLike(likeQuestion);
      this.setData({
        'questionDetail.liked': !liked,
        'questionDetail.likeCount': liked
          ? Math.max(0, (questionDetail.likeCount || 0) - 1)
          : (questionDetail.likeCount || 0) + 1,
      });
      Message.success({
        content: liked ? '已取消点赞' : '点赞成功',
        duration: 2000,
      });
    } catch (error) {
      console.error('点赞操作失败:', error);
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    }
  },

  async onCollect() {
    if (this.data.error || this.data.isEmpty) return;

    const { questionDetail } = this.data;
    const collected = !!(questionDetail.collected ?? questionDetail.isCollected);

    try {
      const collectQuestion = new QuestionLikeOrCollectParams(
        this.data.questionId,
        null,
        !collected,
      );
      await questionApi.toggleCollect(collectQuestion);
      this.setData({
        'questionDetail.collected': !collected,
        'questionDetail.collectCount': collected
          ? Math.max(0, (questionDetail.collectCount || 0) - 1)
          : (questionDetail.collectCount || 0) + 1,
      });

      Message.success({
        content: collected ? '已取消收藏' : '收藏成功',
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
