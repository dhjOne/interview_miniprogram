import Message from 'tdesign-miniprogram/message/index';
import {
  questionApi,
  socialApi,
  handleApiError
} from '~/api/index';
import {
  QuestionLikeOrCollectParams,
  QuestionParams
} from '~/api/param/param_question';
import {
  resolveAuthorAvatar,
  resolveAuthorDisplayName,
  resolveAuthorFollowing,
  resolveAuthorId,
  resolveCurrentUserId
} from '~/utils/author';
import { trackQuestionBrowse } from '~/utils/practiceBrowse';
import {
  buildSharePanels,
  fetchReplyThread,
  formatDisplayDate,
  normalizeComment,
  normalizeQuestionDetail,
  parseCommentListResponse,
  patchCommentLike,
  truncateText
} from '~/utils/questionDetail';
import { processContentBlocks } from '~/utils/questionContentBlocks';
import { safeDecodeURIComponent } from '~/utils/questionList';
import { backPage, openPage } from '~/utils/router';

const { renderMarkdown } = require('../../../utils/towxmlLoader');

Page({
  data: {
    questionId: null,
    questionDetail: {},
    relatedQuestions: [],
    comments: [],
    commentCount: 0,
    commentPage: 1,
    commentPageSize: 15,
    commentTotal: 0,
    commentHasMore: true,
    commentLoading: false,
    commentLoadingMore: false,
    replyLoadingIds: {},
    commentText: '',
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

    showCommentPanel: false,
    replyParentId: null,
    replyRootId: null,
    replyTargetName: '',
    replyTargetContent: '',
    replyHighlightId: null,
    commentPlaceholder: '说点什么...',
    likedCommentIds: {},
    expandedReplyIds: {},

    // 新增状态字段
    loading: true, // 加载中
    error: false, // 错误状态
    errorMessage: '', // 错误信息
    isEmpty: false, // 空数据状态

    // 分享相关状态
    showShareActionSheet: false, // 分享操作面板
    showCustomGuide: false, // 使用自定义引导弹窗

    sharePanels: buildSharePanels(false),
    contentBlocks: [], // 内容块数组
    blockStyles: {}, // 块样式配置
    currentTheme: 'default', // 当前主题

    // 新增：towxml 相关字段
    isMarkdown: false, // 是否为 markdown 内容
    towxmlData: null, // towxml 解析后的数据
    towxmlOptions: {
      // towxml 配置选项
      theme: 'light', // 主题：light/dark
      events: {
        // 图片点击事件
        tap: (e) => {
          const { dataset } = e.currentTarget;
          if (dataset.src) {
            wx.previewImage({
              current: dataset.src,
              urls: [dataset.src]
            });
          }
        },
        // 链接点击事件
        linktap: (e) => {
          const { href } = e.currentTarget.dataset;
          console.log('链接点击:', href);
          // 可以在这里处理链接跳转
        }
      }
    }

  },

  onLoad(options) {
    console.log('题目详情页面加载', options);
    const { id, categoryId, categoryName, title } = options;
    if (!id) {
      this.setData({
        loading: false,
        error: true,
        errorMessage: '题目ID不能为空'
      });
      return;
    }

    const decodedCategoryName = safeDecodeURIComponent(categoryName);
    const decodedTitle = safeDecodeURIComponent(title);

    this.setData({
      questionId: id,
      categoryId: categoryId || null,
      categoryName: decodedCategoryName,
      catalogTitle: decodedCategoryName || '题目目录'
    });

    if (decodedTitle) {
      wx.setNavigationBarTitle({ title: decodedTitle });
    }

    this.loadQuestionDetail();
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  onPullDownRefresh() {
    return this.refreshPage();
  },

  // 加载题目详情
  async loadQuestionDetail() {
    try {
      this.setData({
        loading: true,
        error: false,
        isEmpty: false,
        isMarkdown: false,
        towxmlData: null
      });
      
      const questionParams = new QuestionParams(null, null, this.data.questionId)
      const response = await questionApi.getQuestionDetail(questionParams);
      
      if (response.data) {
        const questionDetail = normalizeQuestionDetail(response.data);
        
        // 判断内容类型
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
          commentCount: questionDetail.commentCount ?? 0
        };
        if (!this.data.categoryId && questionDetail.categoryId) {
          patch.categoryId = questionDetail.categoryId;
        }
        if (questionDetail.categoryName) {
          patch.catalogTitle = questionDetail.categoryName;
        }

        this.setData(patch);

        // 浏览历史：详情加载成功后记录（失败不影响阅读）
        trackQuestionBrowse({
          id: questionDetail.id ?? this.data.questionId,
          title: questionDetail.title
        }).catch(() => {});

        this.loadCommentCount();
        
        // 根据内容类型选择渲染方式
        if (isMarkdownContent) {
          // 使用 towxml 渲染 markdown
          this.renderMarkdownWithTowxml(questionDetail);
        } else {
          // 使用现有的 contentBlocks 渲染
          this.renderWithContentBlocks(questionDetail);
        }
        
        // 设置页面标题
        // wx.setNavigationBarTitle({
        //   title: questionDetail.title || '题目详情'
        // });
      } else {
        // 数据为空
        this.setData({
          loading: false,
          error: false,
          isEmpty: true
        });
      }
    } catch (error) {
      console.error('加载题目详情失败:', error);
      this.setData({
        loading: false,
        error: true,
        errorMessage: '网络错误，请重试'
      });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  // 使用 contentBlocks 渲染
  renderWithContentBlocks(questionDetail) {
    const contentBlocks = questionDetail.contentList || [];
    console.log('contentBlocks::::', contentBlocks)
    
    this.setData({
      contentBlocks: processContentBlocks(contentBlocks)
    });
    
    // 检查最终设置的数据
    console.log('设置后的 contentBlocks:', this.data.contentBlocks);
  },

  // 使用 towxml 渲染 markdown
  renderMarkdownWithTowxml(questionDetail) {
    const markdownContent = questionDetail.content || questionDetail.previewFullContent || '';

    if (!markdownContent) {
      console.warn('Markdown 内容为空');
      this.setData({ contentBlocks: [] });
      return;
    }

    console.log('开始解析 markdown 内容，长度:', markdownContent.length);

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
        console.log('towxml 解析完成:', towxmlData);
        this.setData({
          towxmlData,
          contentBlocks: [],
        });
      })
      .catch((error) => {
      console.error('解析 markdown 失败:', error);
      // 如果解析失败，尝试降级使用 contentList
      if (questionDetail.contentList && questionDetail.contentList.length > 0) {
        console.warn('Markdown 解析失败，尝试使用 contentList 渲染');
        this.renderWithContentBlocks(questionDetail);
      } else {
        this.setData({
          error: true,
          errorMessage: '内容解析失败'
        });
      }
      });
  },

  // 点击分享按钮
  onShare() {
    this.setData({
      showShareActionSheet: true
    });
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

  // 分享选项选择（兼容旧 ActionSheet，保留备用）
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
        reason: '题目内容举报'
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
        reason: '作者举报'
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
            reason: '从题目详情拉黑作者'
          });
          this.setData({ authorFollowing: false });
          wx.showToast({ title: '已拉黑', icon: 'none' });
        } catch (e) {
          handleApiError(e, { fallbackMessage: '操作失败' });
        }
      }
    });
  },

  // 关闭分享 ActionSheet
  onShareActionSheetClose() {
    console.log('关闭 ActionSheet');
    this.setData({
      showShareActionSheet: false
    });
  },

  // 显示自定义引导弹窗
  showCustomGuide() {
    this.setData({
      showCustomGuide: true
    });
  },

  // 关闭自定义引导
  onCloseCustomGuide(e) {
    if (e && e.detail !== undefined) {
      const visible = e.detail?.visible ?? e.detail;
      if (visible) return;
    }
    this.setData({
      showCustomGuide: false
    });
  },

  // 复制链接
  copyLink() {
    const link = `pages/question/detail/index?id=${this.data.questionId}`;
    wx.setClipboardData({
      data: link,
      success: () => {
        Message.success({
          content: '链接已复制到剪贴板',
          duration: 2000
        });
      }
    });
  },

  // 分享到朋友圈
  shareToMoment() {
    this.setData({
      showCustomGuide: true
    });
  },

  // 刷新页面
  refreshPage() {
    this.setData({
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
      expandedReplyIds: {}
    });
    return this.loadQuestionDetail();
  },

  // 重新加载
  retryLoad() {
    this.setData({
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
      expandedReplyIds: {}
    });
    this.loadQuestionDetail();
  },


  // 返回上一页
  goBack() {
    backPage();
  },

  // 评论相关方法
  onCommentChange(event) {
    this.setData({
      commentText: event.detail.value
    });
  },

  async loadCommentCount() {
    try {
      const response = await questionApi.getQuestionCommentCount(this.data.questionId);
      const count = Number(response.data ?? 0);
      this.setData({
        commentCount: count,
        'questionDetail.commentCount': count
      });
    } catch (e) {
      console.warn('加载评论统计失败', e);
    }
  },

  async loadComments(refresh = true) {
    const questionId = this.data.questionId;
    if (!questionId) return;

    if (!refresh && (this.data.commentLoadingMore || !this.data.commentHasMore || this.data.commentLoading)) {
      return;
    }

    const nextPage = refresh ? 1 : this.data.commentPage + 1;

    if (refresh) {
      this.setData({
        commentLoading: true,
        commentPage: 1,
        commentTotal: 0,
        commentHasMore: true,
        comments: []
      });
    } else {
      this.setData({ commentLoadingMore: true });
    }

    try {
      const response = await questionApi.getQuestionComments(questionId, {
        page: nextPage,
        limit: this.data.commentPageSize
      });

      const { rows, total, hasTotal } = parseCommentListResponse(response);
      const newChunk = rows.map((row) => normalizeComment(row));
      const comments = refresh ? newChunk : [...this.data.comments, ...newChunk];
      const commentHasMore = hasTotal
        ? comments.length < total
        : newChunk.length >= this.data.commentPageSize;

      this.setData({
        comments,
        commentPage: nextPage,
        commentTotal: hasTotal ? total : comments.length,
        commentHasMore,
        commentLoading: false,
        commentLoadingMore: false
      });
      this.loadCommentCount();
    } catch (e) {
      console.warn('加载评论失败', e);
      this.setData({
        commentLoading: false,
        commentLoadingMore: false
      });
    }
  },

  loadMoreComments() {
    this.loadComments(false);
  },

  async onToggleReplies(event) {
    const commentId = event.currentTarget.dataset.id;
    if (!commentId) return;

    const expandedReplyIds = { ...(this.data.expandedReplyIds || {}) };
    const isExpanded = !!expandedReplyIds[commentId];

    if (isExpanded) {
      delete expandedReplyIds[commentId];
      this.setData({ expandedReplyIds });
      return;
    }

    expandedReplyIds[commentId] = true;
    this.setData({ expandedReplyIds });

    const commentIndex = this.data.comments.findIndex(
      (item) => String(item.id) === String(commentId)
    );
    if (commentIndex < 0) return;

    const comment = this.data.comments[commentIndex];
    if (comment.repliesLoaded || comment.repliesLoading) {
      return;
    }

    const comments = [...this.data.comments];
    comments[commentIndex] = { ...comment, repliesLoading: true };
    const replyLoadingIds = { ...(this.data.replyLoadingIds || {}), [commentId]: true };
    this.setData({ comments, replyLoadingIds });

    try {
      const replies = await fetchReplyThread(comment);
      const latestComments = [...this.data.comments];
      const latestIndex = latestComments.findIndex(
        (item) => String(item.id) === String(commentId)
      );
      if (latestIndex < 0) return;

      latestComments[latestIndex] = {
        ...latestComments[latestIndex],
        replies,
        repliesLoaded: true,
        repliesLoading: false,
        replyCount: Math.max(replies.length, latestComments[latestIndex].replyCount || 0)
      };

      const nextReplyLoadingIds = { ...(this.data.replyLoadingIds || {}) };
      delete nextReplyLoadingIds[commentId];
      this.setData({
        comments: latestComments,
        replyLoadingIds: nextReplyLoadingIds
      });
    } catch (e) {
      console.warn('加载回复失败', commentId, e);
      const latestComments = [...this.data.comments];
      const latestIndex = latestComments.findIndex(
        (item) => String(item.id) === String(commentId)
      );
      if (latestIndex >= 0) {
        latestComments[latestIndex] = {
          ...latestComments[latestIndex],
          repliesLoading: false
        };
      }
      const nextReplyLoadingIds = { ...(this.data.replyLoadingIds || {}) };
      delete nextReplyLoadingIds[commentId];
      const nextExpandedReplyIds = { ...(this.data.expandedReplyIds || {}) };
      delete nextExpandedReplyIds[commentId];
      this.setData({
        comments: latestComments,
        replyLoadingIds: nextReplyLoadingIds,
        expandedReplyIds: nextExpandedReplyIds
      });
      handleApiError(e, { fallbackMessage: '回复加载失败' });
    }
  },

  async loadCatalog(refresh = true) {
    const categoryId = this.data.categoryId;

    if (!refresh && (this.data.catalogLoadingMore || !this.data.catalogHasMore || this.data.catalogLoading)) {
      return;
    }

    if (!categoryId) {
      if (!refresh) return;
      this.setData({ catalogLoading: true, catalogList: [], catalogPage: 1 });
      try {
        const response = await questionApi.getRelatedQuestions(
          new QuestionParams(null, null, this.data.questionId)
        );
        let rows = response.data?.rows ?? response.data ?? [];
        if (!Array.isArray(rows)) rows = [];

        const catalogList = rows.map((row, index) => ({
          id: row.id,
          title: row.title || `题目 ${index + 1}`,
          index: index + 1,
          displayDate: formatDisplayDate(row.updatedAt || row.createdAt)
        }));

        this.setData({
          catalogList,
          catalogPage: 1,
          catalogTotal: catalogList.length,
          catalogHasMore: false,
          catalogSupportsPagination: false,
          catalogLoaded: true,
          catalogTitle: this.data.catalogTitle || this.data.categoryName || '相关题目'
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
        catalogSupportsPagination: true
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
        displayDate: formatDisplayDate(row.updatedAt || row.createdAt)
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
        catalogTitle: this.data.catalogTitle || this.data.categoryName || '相关题目'
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
      loading: true,
      isMarkdown: false,
      towxmlData: null,
      contentBlocks: [],
      catalogLoaded: false,
      catalogList: [],
      catalogPage: 1,
      catalogTotal: 0,
      catalogHasMore: true,
      catalogLoadingMore: false,
      comments: [],
      commentPage: 1,
      commentTotal: 0,
      commentHasMore: true,
      commentLoading: false,
      commentLoadingMore: false,
      replyLoadingIds: {},
      expandedReplyIds: {}
    });
    if (item?.title) {
      wx.setNavigationBarTitle({ title: item.title });
    }
    this.loadQuestionDetail();
  },

  onAuthorTap() {
    const { questionDetail } = this.data;
    const { authorId, authorDisplayName } = this.data;
    const avatar = resolveAuthorAvatar(questionDetail);

    if (!authorId) {
      wx.showToast({ title: '暂无作者信息', icon: 'none' });
      return;
    }

    const qs = [
      `userId=${encodeURIComponent(authorId)}`,
      `nickname=${encodeURIComponent(authorDisplayName || '')}`
    ];
    if (avatar) {
      qs.push(`avatar=${encodeURIComponent(avatar)}`);
    }
    openPage({
      url: `/pages/ucenter/profile/index?${qs.join('&')}`
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
        icon: 'none'
      });
      return;
    }
    try {
      const response = await socialApi.toggleFollow({
        userId: this.data.authorId,
        follow: nextFollowing
      });
      this.setData({ authorFollowing: nextFollowing });
      Message.success({
        content: nextFollowing ? '已关注作者' : '已取消关注',
        duration: 2000
      });
    } catch (e) {
      console.warn('关注作者失败', e);
      handleApiError(e, { fallbackMessage: '操作失败' });
    }
  },

  onOpenComments() {
    this.setData({ showCommentPanel: true });
    if (!this.data.comments.length && !this.data.commentLoading) {
      this.loadComments(true);
    }
  },

  onCloseComments() {
    this.clearReplyState();
    this.setData({ showCommentPanel: false });
  },

  clearReplyState() {
    this.setData({
      replyParentId: null,
      replyRootId: null,
      replyTargetName: '',
      replyTargetContent: '',
      replyHighlightId: null,
      commentPlaceholder: '说点什么...'
    });
  },

  onCommentPanelVisibleChange(e) {
    const visible = e.detail?.visible ?? e.detail;
    if (!visible) {
      this.clearReplyState();
      this.setData({ showCommentPanel: false });
    }
  },

  async onSubmitComment() {
    const content = (this.data.commentText || '').trim();
    if (!content) {
      Message.info({ content: '请输入评论内容', duration: 2000 });
      return;
    }

    const payload = {
      questionId: Number(this.data.questionId),
      content
    };
    if (this.data.replyParentId) {
      payload.parentId = Number(this.data.replyParentId);
    }

    const replyRootId = this.data.replyRootId;
    const expandedReplyIds = { ...(this.data.expandedReplyIds || {}) };
    if (replyRootId) {
      expandedReplyIds[replyRootId] = true;
    }

    try {
      const response = await questionApi.submitComment(payload);
      Message.success({ content: '评论发布成功', duration: 2000 });
      const newCommentId = response.data;
      this.setData({
        commentText: '',
        expandedReplyIds
      });
      this.clearReplyState();
      await this.loadComments(true);
      if (newCommentId) {
        this.setData({ replyHighlightId: newCommentId });
      }
    } catch (e) {
      console.warn('提交评论失败', e);
      handleApiError(e, { fallbackMessage: '评论发布失败' });
    }
  },

  async onLikeComment(event) {
    const commentId = event.currentTarget.dataset.id;
    if (!commentId) return;

    const likedCommentIds = { ...(this.data.likedCommentIds || {}) };
    const currentLiked = !!likedCommentIds[commentId];
    const nextLiked = !currentLiked;

    if (nextLiked) {
      likedCommentIds[commentId] = true;
    } else {
      delete likedCommentIds[commentId];
    }

    const comments = patchCommentLike(this.data.comments, commentId, nextLiked);
    this.setData({ likedCommentIds, comments });

    try {
      await questionApi.likeComment({
        commentId: Number(commentId),
        like: nextLiked
      });
    } catch (e) {
      console.warn('点赞评论失败', e);
      const revertLikedIds = { ...(this.data.likedCommentIds || {}) };
      if (currentLiked) {
        revertLikedIds[commentId] = true;
      } else {
        delete revertLikedIds[commentId];
      }
      this.setData({
        likedCommentIds: revertLikedIds,
        comments: patchCommentLike(this.data.comments, commentId, currentLiked)
      });
      handleApiError(e, { fallbackMessage: '操作失败' });
    }
  },

  async onReportComment(event) {
    const { id, userId, content } = event.currentTarget.dataset;
    if (!id) return;
    try {
      await socialApi.submitReport({
        targetType: 'COMMENT',
        targetId: id,
        targetUserId: userId || undefined,
        targetTitle: truncateText(content || '评论举报', 50),
        reasonType: 'OTHER',
        reason: '评论内容举报'
      });
      wx.showToast({ title: '举报已提交', icon: 'none' });
    } catch (e) {
      handleApiError(e, { fallbackMessage: '提交失败' });
    }
  },

  onReplyComment(event) {
    const { id, name, rootId, content } = event.currentTarget.dataset;
    if (!id) return;

    const targetName = name || '匿名用户';
    const threadRootId = rootId || id;
    const expandedReplyIds = { ...(this.data.expandedReplyIds || {}) };
    if (threadRootId) {
      expandedReplyIds[threadRootId] = true;
    }

    this.setData({
      replyParentId: id,
      replyRootId: threadRootId,
      replyTargetName: targetName,
      replyTargetContent: truncateText(content, 40),
      replyHighlightId: id,
      expandedReplyIds,
      commentPlaceholder: `回复 @${targetName}`
    });
  },

  onCancelReply() {
    this.clearReplyState();
  },

  // 点赞/取消点赞
  async onLike() {
    console.log('点赞题目');
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
          : (questionDetail.likeCount || 0) + 1
      });
      Message.success({
        content: liked ? '已取消点赞' : '点赞成功',
        duration: 2000
      });
    } catch (error) {
      console.error('点赞操作失败:', error);
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    }
  },

  // 收藏/取消收藏
  async onCollect() {
    if (this.data.error || this.data.isEmpty) return;

    const { questionDetail } = this.data;
    const collected = !!(questionDetail.collected ?? questionDetail.isCollected);

    try {
      const collectQuestion = new QuestionLikeOrCollectParams(this.data.questionId, null, !collected);
      await questionApi.toggleCollect(collectQuestion);
      this.setData({
        'questionDetail.collected': !collected,
        'questionDetail.collectCount': collected
          ? Math.max(0, (questionDetail.collectCount || 0) - 1)
          : (questionDetail.collectCount || 0) + 1
      });

      Message.success({
        content: collected ? '已取消收藏' : '收藏成功',
        duration: 2000
      });
    } catch (error) {
      handleApiError(error, { fallbackMessage: '操作失败，请重试' });
    }
  },



  // 在 Page 对象的方法中添加

scrollToComments() {
  this.onOpenComments();
},

// 块点击事件
onBlockTap(event) {
  const { blockId, blockType } = event.currentTarget.dataset;
  console.log('点击内容块:', { blockId, blockType });
  
  // 可以根据块类型执行不同的操作
  switch (blockType) {
    case 'code':
      // 代码块点击逻辑
      break;
    case 'image':
      // 图片块点击逻辑
      break;
    default:
      break;
  }
},


// 复制代码
copyCode(event) {
  const content = event.currentTarget.dataset.content;
  wx.setClipboardData({
    data: content,
    success: () => {
      Message.success({
        content: '代码已复制到剪贴板',
        duration: 2000
      });
    }
  });
},



});