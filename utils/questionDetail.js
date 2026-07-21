import { questionApi } from '~/api/index';

export function formatCommentTime(value) {
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

export function truncateText(text, maxLen = 36) {
  const value = (text || '').trim();
  if (!value) return '';
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

export function formatDisplayDate(value) {
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

export function normalizeQuestionDetail(detail) {
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

export function buildSharePanels(isSelfAuthor) {
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

export function resolveReplyCount(row) {
  if (!row) return 0;
  const embedded = Array.isArray(row.replies) ? row.replies.length : 0;
  const count = row.replyCount ?? row.repliesCount ?? row.childCount ?? row.childrenCount;
  if (count !== undefined && count !== null && count !== '') {
    return Math.max(Number(count) || 0, embedded);
  }
  return embedded;
}

export function normalizeComment(row, extra = {}) {
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

export function parseCommentListResponse(response) {
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

export async function fetchReplyThread(rootComment) {
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

export function patchCommentLike(list, commentId, nextLiked) {
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
