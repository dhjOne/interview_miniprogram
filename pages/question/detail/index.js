import Message from 'tdesign-miniprogram/message/index';
import {
  questionApi
} from '~/api/index';
import { socialApi } from '~/api/index';
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

const { renderMarkdown } = require('../../../utils/towxmlLoader');

function formatCommentTime(value) {
  if (!value) return '';
  const normalized = String(value).replace('T', ' ');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return normalized.slice(0, 16);
  }
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
}

function truncateText(text, maxLen = 36) {
  const value = (text || '').trim();
  if (!value) return '';
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

function formatDisplayDate(value) {
  if (!value) return '';
  const normalized = String(value).replace('T', ' ');
  const match = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const month = `${match[2]}`.padStart(2, '0');
    const day = `${match[3]}`.padStart(2, '0');
    return `${match[1]}-${month}-${day}`;
  }
  const date = new Date(normalized.replace(/-/g, '/'));
  if (Number.isNaN(date.getTime())) {
    return normalized.slice(0, 10);
  }
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function normalizeQuestionDetail(detail) {
  if (!detail) return {};
  return {
    ...detail,
    liked: !!(detail.liked ?? detail.isLiked),
    collected: !!(detail.collected ?? detail.isCollected),
    likeCount: detail.likeCount ?? detail.like_count ?? 0,
    collectCount: detail.collectCount ?? detail.collect_count ?? 0,
    viewCount: detail.viewCount ?? detail.view_count ?? 0,
    commentCount: detail.commentCount ?? detail.comment_count ?? 0,
    createdAt: formatDisplayDate(
      detail.createdAt ?? detail.created_at ?? detail.createTime ?? detail.create_time
    )
  };
}

function buildSharePanels(isSelfAuthor) {
  const panels = [
    {
      title: '分享与操作',
      items: [
        { label: '刷新', value: 'refresh', icon: 'refresh', tone: 'brand' },
        { label: '复制链接', value: 'copy', icon: 'link', tone: 'brand' },
        { label: '微信好友', value: 'wechat', icon: 'logo-wechat-stroke', tone: 'wechat' },
        { label: '朋友圈', value: 'moment', icon: 'share', tone: 'wechat' }
      ]
    }
  ];

  if (!isSelfAuthor) {
    panels.push({
      title: '安全反馈',
      items: [
        { label: '举报题目', value: 'reportQuestion', icon: 'error-circle', tone: 'warn' },
        { label: '举报作者', value: 'reportAuthor', icon: 'user-circle', tone: 'warn' },
        { label: '拉黑作者', value: 'blockAuthor', icon: 'close-circle', tone: 'danger' }
      ]
    });
  }

  return panels;
}

function resolveReplyCount(row) {
  if (!row) return 0;
  const embedded = Array.isArray(row.replies) ? row.replies.length : 0;
  const count = row.replyCount ?? row.repliesCount ?? row.childCount ?? row.childrenCount;
  if (count !== undefined && count !== null && count !== '') {
    return Math.max(Number(count) || 0, embedded);
  }
  return embedded;
}

function normalizeComment(row, extra = {}) {
  if (!row) return row;
  const embeddedReplies = Array.isArray(row.replies) ? row.replies : [];
  const replyCount = resolveReplyCount(row);
  return {
    ...row,
    ...extra,
    likeCount: row.likeCount ?? 0,
    timeText: formatCommentTime(row.createdAt || row.createTime),
    userName: row.userName || row.nickname || (row.userId ? `用户${row.userId}` : '匿名用户'),
    replyCount,
    replies: embeddedReplies,
    repliesLoaded: embeddedReplies.length > 0,
    repliesLoading: false
  };
}

function parseCommentListResponse(response) {
  const data = response?.data;
  if (Array.isArray(data)) {
    return {
      rows: data,
      total: data.length,
      hasTotal: false
    };
  }
  const rows = data?.rows ?? data?.list ?? data?.records ?? [];
  const parsedTotal = Number(data?.total);
  const hasTotal = data?.total !== undefined && data?.total !== null && !Number.isNaN(parsedTotal);
  return {
    rows: Array.isArray(rows) ? rows : [],
    total: hasTotal ? parsedTotal : 0,
    hasTotal
  };
}

async function fetchReplyThread(rootComment) {
  const replies = [];
  const commentById = { [String(rootComment.id)]: rootComment };

  async function walk(parentId) {
    try {
      const res = await questionApi.getCommentReplies(parentId);
      const rows = Array.isArray(res.data) ? res.data : [];
      for (const row of rows) {
        const parent = commentById[String(parentId)];
        const normalized = normalizeComment(row, {
          rootId: rootComment.id,
          replyToName: parent?.userName || '匿名用户',
          replyToId: parentId
        });
        commentById[String(row.id)] = normalized;
        replies.push(normalized);
        await walk(row.id);
      }
    } catch (err) {
      console.warn('加载子回复失败', parentId, err);
    }
  }

  await walk(rootComment.id);
  replies.sort((a, b) => {
    const ta = new Date(String(a.createdAt || a.createTime || '').replace('T', ' ')).getTime() || 0;
    const tb = new Date(String(b.createdAt || b.createTime || '').replace('T', ' ')).getTime() || 0;
    return ta - tb;
  });
  return replies;
}

function patchCommentLike(list, commentId, nextLiked) {
  const delta = nextLiked ? 1 : -1;
  return list.map((item) => {
    if (String(item.id) === String(commentId)) {
      return {
        ...item,
        likeCount: Math.max(0, (item.likeCount || 0) + delta)
      };
    }
    if (item.replies?.length) {
      const replies = item.replies.map((reply) => {
        if (String(reply.id) === String(commentId)) {
          return {
            ...reply,
            likeCount: Math.max(0, (reply.likeCount || 0) + delta)
          };
        }
        return reply;
      });
      return { ...item, replies };
    }
    return item;
  });
}

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

    const decodedCategoryName = categoryName ? decodeURIComponent(categoryName) : '';
    const decodedTitle = title ? decodeURIComponent(title) : '';

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
      contentBlocks: this.processContentBlocks(contentBlocks)
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
      wx.showToast({ title: e?.message || '提交失败', icon: 'none' });
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
      wx.showToast({ title: e?.message || '提交失败', icon: 'none' });
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
          wx.showToast({ title: e?.message || '操作失败', icon: 'none' });
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
    wx.navigateBack();
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
      wx.showToast({ title: '回复加载失败', icon: 'none' });
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
          displayDate: (row.updatedAt || row.createdAt || '').slice(0, 10)
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
        displayDate: (row.updatedAt || row.createdAt || '').slice(0, 10)
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
    wx.navigateTo({
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
      wx.showToast({
        title: e?.message || '操作失败',
        icon: 'none'
      });
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
      Message.error({ content: e.message || '评论发布失败', duration: 2000 });
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
      Message.info({ content: e.message || '操作失败', duration: 2000 });
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
      wx.showToast({ title: e?.message || '提交失败', icon: 'none' });
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
      Message.error({
        content: '操作失败，请重试',
        duration: 2000
      });
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
      Message.error({
        content: '操作失败，请重试',
        duration: 2000
      });
    }
  },


  // -------------加载content--------开始------------//
  // 在 processContentBlocks 方法中处理所有块类型
  processContentBlocks(blocks) {
    if (!blocks || !Array.isArray(blocks)) {
      console.warn('内容块数据为空或不是数组:', blocks);
      return [];
    }

    const filteredBlocks = blocks
      .filter(block => {
        if (!block.id || !block.blockType) return false;
        return block.isActive !== 0;
      })
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      .map(block => {
        // 处理 metadata 和 style 字段
        let metadata = {};
        let style = {};
        let config = {};

        try {
          metadata = typeof block.metadata === 'string' ?
            JSON.parse(block.metadata) : (block.metadata || {});
        } catch (e) {
          console.warn('metadata 解析失败:', block.metadata);
        }

        try {
          style = typeof block.style === 'string' ?
            JSON.parse(block.style) : (block.style || {});
        } catch (e) {
          console.warn('style 解析失败:', block.style);
        }

        try {
          config = typeof block.config === 'string' ?
            JSON.parse(block.config) : (block.config || {});
        } catch (e) {
          console.warn('config 解析失败:', block.config);
        }

        const processedBlock = {
          ...block,
          metadata,
          style,
          config,
          content: block.content ? String(block.content) : ''
        };

        // 为所有块类型生成自定义样式
        processedBlock.customStyle = this.generateCustomStyle(style, block.blockType);
        processedBlock.customClass = style.className || '';

        // 根据块类型进行特殊处理
        return this.processBlockByType(processedBlock);
      });

    console.log('处理后的内容块:', filteredBlocks);
    return filteredBlocks;
  },

  // 根据块类型进行特殊处理
  processBlockByType(block) {
    switch (block.blockType) {
      case 'code':
        return this.processCodeBlock(block);
      case 'image':
        return this.processImageBlock(block);
      case 'table':
        return this.processTableBlock(block);
      case 'formula':
        return this.processFormulaBlock(block);
      case 'file':
        return this.processFileBlock(block);
      case 'divider':
        return this.processDividerBlock(block);
      case 'video':
        return this.processVideoBlock(block);
      case 'text':
      default:
        return this.processTextBlock(block);
    }
  },

  // 处理代码块
  processCodeBlock(block) {
    const language = block.metadata.language || 'plaintext';
    const showLineNumbers = block.config.lineNumbers !== false;

    return {
      ...block,
      formattedContent: {
        language,
        showLineNumbers,
        theme: block.config.theme || 'default'
      }
    };
  },

  // 处理图片块
  processImageBlock(block) {
    return {
      ...block,
      imageInfo: {
        src: block.content,
        alt: block.metadata.alt || '图片',
        width: block.metadata.width || '100%',
        height: block.metadata.height || 'auto',
        caption: block.metadata.caption,
        zoomable: block.config.zoomable !== false
      }
    };
  },

  // 处理表格块
  processTableBlock(block) {
    let tableData = {
      headers: [],
      rows: []
    };

    try {
      if (block.contentFormat === 'csv') {
        const lines = block.content.split('\n');
        if (lines.length > 0) {
          tableData.headers = lines[0].split(',').map(h => h.trim());
          tableData.rows = lines.slice(1).map(line =>
            line.split(',').map(cell => cell.trim())
          );
        }
      } else if (block.contentFormat === 'json') {
        tableData = JSON.parse(block.content);
      }
    } catch (e) {
      console.warn('表格数据解析失败:', e);
    }

    return {
      ...block,
      tableData
    };
  },

  // 处理公式块
  processFormulaBlock(block) {
    return {
      ...block,
      formulaInfo: {
        formula: block.content,
        format: block.metadata.format || 'latex',
        isInline: block.metadata.isInline || false
      }
    };
  },

  // 处理文件块
  processFileBlock(block) {
    return {
      ...block,
      fileInfo: {
        url: block.content,
        fileName: block.metadata.fileName || '未命名文件',
        fileSize: block.metadata.fileSize || '未知大小',
        fileType: block.metadata.fileType || 'application/octet-stream'
      }
    };
  },

  // 处理分割线块
  processDividerBlock(block) {
    const subtype = block.blockSubtype || 'line';
    return {
      ...block,
      dividerType: subtype // line, dashed, dotted 等
    };
  },

  // 处理视频块
  processVideoBlock(block) {
    return {
      ...block,
      videoInfo: {
        src: block.content,
        poster: block.metadata.poster,
        controls: block.config.controls !== false,
        autoplay: block.config.autoplay || false
      }
    };
  },

  // 处理文本块
  processTextBlock(block) {
    let formattedContent = block.content;
    let hasProcessedNumberedSections = false;
    let hasBoldText = false;
    let lines = [];
    let hasLineBreaks = false;

    // 检查是否需要处理数字分段
    if (this.shouldProcessNumberedContent(block.content, block.blockSubtype)) {
      formattedContent = this.formatNumberedContent(block.content, {
        // 配置处理规则
        symbols: ['、', '.', ':', '．'], // 需要处理的符号
        indent: '', // 两个全角空格缩进
        lineBreak: '\n', // 换行符
        processSpaces: true // 处理空格换行
      });
      hasProcessedNumberedSections = true;
    }
    // 检查文本中是否包含加粗标记（**内容**）
    if (this.containsBoldMarkers(formattedContent)) {
      formattedContent = this.processBoldText(formattedContent);
      hasBoldText = true;
    }
    console.log('检查文本中是否包含加粗标记（**内容**）::',formattedContent)
     
   
    // 如果内容是markdown格式，处理其他markdown元素
    if (block.contentFormat === 'markdown') {
      formattedContent = this.processOtherMarkdown(formattedContent);
    }
    if (formattedContent.includes('\n')) {
      lines = formattedContent.split('\n');
      hasLineBreaks = true;
    } else {
      lines = [formattedContent];
    }
   
    return {
      ...block,
      textInfo: {
        content: block.content,
        formattedContent: formattedContent,
        format: block.contentFormat || 'plain',
        subtype: block.blockSubtype || 'paragraph',
        hasNumberedSections: hasProcessedNumberedSections,
        hasBoldText: block.content.includes('**'),
        processedWithNumberedFormat: hasProcessedNumberedSections,
        hasLineBreaks: hasLineBreaks,
        lines: lines // 按行分割的内容数组
      }
    };
  },
  /**
   * 处理换行符 - 让下一行自动缩进两个中文字符
   */
  processLineBreaks(content) {
    if (!content || typeof content !== 'string') return content;
    
    // 将换行符替换为换行+缩进
    // 使用正则表达式匹配换行符，并在其后添加两个全角空格
    return content.replace(/\n/g, '\n　　');
  },
  /**
   * 检查文本是否包含加粗标记
   */
  containsBoldMarkers(content) {
    if (!content || typeof content !== 'string') return false;
    return content.includes('**');
  },
  // 处理加粗文本
  processBoldText(content) {
    // 使用正则表达式替换 **加粗内容** 为富文本格式
    return content.replace(/\*\*(.*?)\*\*/g, '<span class="bold-text" style="font-weight: bold;">$1</span>');
  },
  /**
 * 处理其他Markdown元素（仅当contentFormat为markdown时）
 */
  processOtherMarkdown(content) {
    let processed = content;
    
    // 处理斜体文本：*斜体内容* -> 富文本格式
    processed = processed.replace(/\*(.*?)\*/g, '<span class="italic-text" style="font-style: italic;">$1</span>');
    
    // 处理代码片段：`代码` -> 富文本格式
    processed = processed.replace(/`(.*?)`/g, '<span class="inline-code" style="background: #f6f8fa; padding: 4rpx 8rpx; border-radius: 4rpx; font-family: monospace;">$1</span>');
    
    return processed;
  },
  // 生成自定义样式（所有块类型通用）
  generateCustomStyle(styleConfig, blockType) {
    let styleString = '';

    // 使用数据库中的 CSS
    if (styleConfig.css) {
      styleString += styleConfig.css;
    }

    // 如果没有自定义样式，提供智能默认值
    if (!styleConfig.css) {
      styleString += this.getDefaultStyle(blockType);
    }

    return styleString;
  },

  // 获取默认样式
  getDefaultStyle(blockType) {
    const defaultStyles = {
      text: 'font-size: 32rpx; line-height: 1.6; margin-bottom: 24rpx;',
      code: 'background: #f6f8fa; border-radius: 8rpx; padding: 24rpx; margin: 20rpx 0; font-family: "Monaco", "Consolas", monospace;',
      image: 'text-align: center; margin: 20rpx 0;',
      table: 'margin: 24rpx 0; border-radius: 8rpx; overflow: hidden;',
      formula: 'text-align: center; padding: 24rpx; margin: 20rpx 0; background: #f8f9fa; border-radius: 8rpx;',
      file: 'background: #f8f9fa; padding: 24rpx; border-radius: 12rpx; margin: 20rpx 0;',
      divider: 'border-top: 1rpx solid #e0e0e0; margin: 32rpx 0;',
      video: 'width: 100%; margin: 20rpx 0; border-radius: 8rpx;'
    };

    return defaultStyles[blockType] || '';
  },
    /**
   * 判断是否需要处理数字分段内容
   */
  shouldProcessNumberedContent(content, subtype) {
    if (!content) return false;
    
    // 如果是明确的编号项类型，直接处理
    if (subtype === 'numbered_item') {
      return true;
    }
    
    // 检查是否包含数字+符号模式
    const numberSymbolPattern = /\b\d+[、.:．]\s/;
    return numberSymbolPattern.test(content);
  },

  /**
   * 精确的数字分段内容格式化
   * 只处理数字+特定符号的模式，不影响其他文本
   */
  formatNumberedContent(content, options = {}) {
    const config = {
      symbols: ['、', '.', ':', '．'],
      indent: '　　',
      lineBreak: '\n',
      processSpaces: true,
      ...options
    };

    // 构建正则表达式模式
    const symbolPattern = config.symbols.map(s => this.escapeRegExp(s)).join('|');
    const numberPattern = `(\\b\\d+)[${symbolPattern}]\\s*`;
    
    // 分割内容，但保留分隔符
    const segments = [];
    let lastIndex = 0;
    let match;
    
    // 使用正则表达式查找所有匹配
    const regex = new RegExp(numberPattern, 'g');
    
    match = regex.exec(content);
    while (match !== null) {
      // 找到匹配前的文本
      const beforeMatch = content.substring(lastIndex, match.index);
      if (beforeMatch.trim()) {
        segments.push(beforeMatch);
      }
      
      // 添加匹配到的数字分段（包括数字和符号）
      const numberedSection = match[0];
      segments.push(numberedSection);
      
      lastIndex = match.index + numberedSection.length;
      match = regex.exec(content);
    }
    
    // 添加剩余文本
    const remainingText = content.substring(lastIndex);
    if (remainingText.trim()) {
      segments.push(remainingText);
    }
    
    // 如果没有找到数字分段，返回原内容
    if (segments.length <= 1) {
      return content;
    }
    
    // 格式化分段
    return this.formatNumberedSegments(segments, config);
  },

  /**
   * 格式化数字分段
   */
  formatNumberedSegments(segments, config) {
    let result = '';
    let inNumberedSection = false;
    
    segments.forEach((segment, index) => {
      // 检查是否是数字分段
      const isNumbered = this.isNumberedSegment(segment, config.symbols);
      
      if (isNumbered) {
        // 如果是数字分段，添加缩进和换行
        if (index > 0) {
          result += config.lineBreak;
        }
        result += config.indent + segment;
        inNumberedSection = true;
      } else {
        // 如果不是数字分段，根据上下文决定是否换行
        if (inNumberedSection && config.processSpaces && segment.trim() === '') {
          // 空格处理：在数字分段后的空格处换行
          result += config.lineBreak + config.indent;
        } else {
          result += segment;
        }
        inNumberedSection = false;
      }
    });
    
    return result;
  },

  /**
   * 判断是否是数字分段
   */
  isNumberedSegment(text, symbols) {
    if (!text || typeof text !== 'string') return false;
    
    const trimmed = text.trim();
    if (!trimmed) return false;
    
    // 检查是否匹配数字+符号模式
    const symbolPattern = symbols.map(s => this.escapeRegExp(s)).join('|');
    const numberPattern = new RegExp(`^\\b\\d+[${symbolPattern}]\\s*`);
    
    return numberPattern.test(trimmed);
  },

  /**
   * 转义正则表达式特殊字符
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * 处理Markdown内容
   */
  processMarkdownContent(content) {
    let processed = content;
    
    // 处理加粗文本：**加粗内容** -> 富文本格式
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<text class="bold-text">$1</text>');
    
    // 处理斜体文本：*斜体内容* -> 富文本格式
    processed = processed.replace(/\*(.*?)\*/g, '<text class="italic-text">$1</text>');
    
    // 处理代码片段：`代码` -> 富文本格式
    processed = processed.replace(/`(.*?)`/g, '<text class="inline-code">$1</text>');
    
    return processed;
  },
  // -------------加载content--------解释------------//


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