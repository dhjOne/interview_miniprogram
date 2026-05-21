/** 从题目/文档详情中解析作者 userId */
export function resolveAuthorId(detail) {
  if (!detail) return '';
  const candidates = [
    detail.createId,
    detail.create_id,
    detail.creatorId,
    detail.creator_id,
    detail.authorId,
    detail.author_id,
    detail.userId,
    detail.user_id,
    detail.createUserId,
    detail.create_user_id,
    detail.createBy,
    detail.create_by,
    detail.createdBy,
    detail.publisherId,
    detail.publisher_id,
    detail.author && detail.author.id,
    detail.author && detail.author.userId,
    detail.creator && detail.creator.id,
    detail.user && detail.user.id
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const id = candidates[i];
    if (id != null && id !== '') return String(id);
  }
  return '';
}

export function resolveAuthorDisplayName(detail, fallback = '用户') {
  if (!detail) return fallback;
  return (
    detail.createName ||
    detail.create_name ||
    detail.authorName ||
    detail.author_name ||
    detail.nickname ||
    (detail.author && (detail.author.nickname || detail.author.name)) ||
    fallback
  );
}

export function resolveAuthorAvatar(detail) {
  if (!detail) return '';
  return (
    detail.authorAvatar ||
    detail.author_avatar ||
    detail.createAvatar ||
    detail.create_avatar ||
    detail.avatar ||
    (detail.author && (detail.author.avatar || detail.author.headImg)) ||
    ''
  );
}

export function resolveAuthorFollowing(detail) {
  if (!detail) return false;
  return !!(
    detail.isFollowingAuthor ??
    detail.authorFollowed ??
    detail.following ??
    detail.isFollowing
  );
}
