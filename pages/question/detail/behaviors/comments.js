import Message from 'tdesign-miniprogram/message/index';
import { questionApi, socialApi, handleApiError } from '~/api/index';
import {
  fetchReplyThread,
  normalizeComment,
  parseCommentListResponse,
  patchCommentLike,
  truncateText,
} from '~/utils/questionDetail';

/**
 * 题目详情：评论列表、回复、点赞、举报
 * 依赖页面提供：questionId
 */
const questionCommentsBehavior = Behavior({
  data: {
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
    showCommentPanel: false,
    replyParentId: null,
    replyRootId: null,
    replyTargetName: '',
    replyTargetContent: '',
    replyHighlightId: null,
    commentPlaceholder: '说点什么...',
    likedCommentIds: {},
    expandedReplyIds: {},
  },

  methods: {
    onCommentChange(event) {
      this.setData({
        commentText: event.detail.value,
      });
    },

    async loadCommentCount() {
      try {
        const response = await questionApi.getQuestionCommentCount(this.data.questionId);
        const count = Number(response.data ?? 0);
        this.setData({
          commentCount: count,
          'questionDetail.commentCount': count,
        });
      } catch (e) {
        console.warn('加载评论统计失败', e);
      }
    },

    async loadComments(refresh = true) {
      const questionId = this.data.questionId;
      if (!questionId) return;

      if (
        !refresh &&
        (this.data.commentLoadingMore || !this.data.commentHasMore || this.data.commentLoading)
      ) {
        return;
      }

      const nextPage = refresh ? 1 : this.data.commentPage + 1;

      if (refresh) {
        this.setData({
          commentLoading: true,
          commentPage: 1,
          commentTotal: 0,
          commentHasMore: true,
          comments: [],
        });
      } else {
        this.setData({ commentLoadingMore: true });
      }

      try {
        const response = await questionApi.getQuestionComments(questionId, {
          page: nextPage,
          limit: this.data.commentPageSize,
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
          commentLoadingMore: false,
        });
        this.loadCommentCount();
      } catch (e) {
        console.warn('加载评论失败', e);
        this.setData({
          commentLoading: false,
          commentLoadingMore: false,
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
        (item) => String(item.id) === String(commentId),
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
          (item) => String(item.id) === String(commentId),
        );
        if (latestIndex < 0) return;

        latestComments[latestIndex] = {
          ...latestComments[latestIndex],
          replies,
          repliesLoaded: true,
          repliesLoading: false,
          replyCount: Math.max(replies.length, latestComments[latestIndex].replyCount || 0),
        };

        const nextReplyLoadingIds = { ...(this.data.replyLoadingIds || {}) };
        delete nextReplyLoadingIds[commentId];
        this.setData({
          comments: latestComments,
          replyLoadingIds: nextReplyLoadingIds,
        });
      } catch (e) {
        console.warn('加载回复失败', commentId, e);
        const latestComments = [...this.data.comments];
        const latestIndex = latestComments.findIndex(
          (item) => String(item.id) === String(commentId),
        );
        if (latestIndex >= 0) {
          latestComments[latestIndex] = {
            ...latestComments[latestIndex],
            repliesLoading: false,
          };
        }
        const nextReplyLoadingIds = { ...(this.data.replyLoadingIds || {}) };
        delete nextReplyLoadingIds[commentId];
        const nextExpandedReplyIds = { ...(this.data.expandedReplyIds || {}) };
        delete nextExpandedReplyIds[commentId];
        this.setData({
          comments: latestComments,
          replyLoadingIds: nextReplyLoadingIds,
          expandedReplyIds: nextExpandedReplyIds,
        });
        handleApiError(e, { fallbackMessage: '回复加载失败' });
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
        commentPlaceholder: '说点什么...',
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
        content,
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
          expandedReplyIds,
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
          like: nextLiked,
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
          comments: patchCommentLike(this.data.comments, commentId, currentLiked),
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
          reason: '评论内容举报',
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
        commentPlaceholder: `回复 @${targetName}`,
      });
    },

    onCancelReply() {
      this.clearReplyState();
    },

    scrollToComments() {
      this.onOpenComments();
    },
  },
});

export default questionCommentsBehavior;
