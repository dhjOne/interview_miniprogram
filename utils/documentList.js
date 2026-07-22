/** 发布文档列表：状态归一化与卡片展示字段 */

/** 列表卡片日期：YYYY-MM-DD */
export function formatDateYMD(value) {
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

/**
 * 文档状态统一为：draft | progress | published | offline
 * - 数字 0~3：0 草稿、1 待审、2 已发、3 下架
 */
export function normalizeDocStatus(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = raw;
    if (n === 0) return 'draft';
    if (n === 1) return 'progress';
    if (n === 2) return 'published';
    if (n === 3) return 'offline';
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (s === '0' || s === 'draft' || s === 'drafts') return 'draft';
  if (s === '1' || s === 'progress' || s === 'review' || s === 'pending' || s === 'auditing') {
    return 'progress';
  }
  if (s === '2' || s === 'published') return 'published';
  if (s === '3' || s === 'offline' || s === 'removed' || s === 'shelved') return 'offline';
  if (s === 'rejected') return 'rejected';
  return null;
}

/** Tab / 路由 query：all 或上述状态 */
export function normalizeTabDocType(raw) {
  if (raw === undefined || raw === null || raw === '') return 'all';
  const s0 = typeof raw === 'number' ? String(raw) : String(raw).trim().toLowerCase();
  if (s0 === 'all' || s0 === '全部') return 'all';
  const st = normalizeDocStatus(raw);
  return st || 'all';
}

const STATUS_TAG_MAP = {
  draft: { text: '草稿', theme: 'default' },
  progress: { text: '审核中', theme: 'warning' },
  published: { text: '已发布', theme: 'success' },
  offline: { text: '已下架', theme: 'default' },
  rejected: { text: '已驳回', theme: 'danger' },
};

const DOC_CARD_TONE = {
  draft: 'doc-card--draft',
  progress: 'doc-card--progress',
  published: 'doc-card--published',
  offline: 'doc-card--offline',
  rejected: 'doc-card--rejected',
};

export function normalizeDocRow(row) {
  const rawTime =
    row.updatedAt ?? row.updated_at ?? row.createdAt ?? row.created_at ?? row.createAt;
  const displayDate = formatDateYMD(rawTime);
  const viewCount = row.viewCount ?? row.view_count ?? 0;
  const commentCount = row.commentCount ?? row.comment_count ?? 0;
  const likeCount = row.likeCount ?? row.like_count ?? 0;
  const rawStatus =
    row.status ?? row.docStatus ?? row.doc_status ?? row.documentStatus ?? row.state;
  const docStatus = normalizeDocStatus(rawStatus);
  const statusTag =
    docStatus && STATUS_TAG_MAP[docStatus]
      ? STATUS_TAG_MAP[docStatus]
      : rawStatus !== undefined && rawStatus !== null && rawStatus !== ''
      ? { text: '未知', theme: 'default' }
      : null;
  const docCardTone = (docStatus && DOC_CARD_TONE[docStatus]) || 'doc-card--default';
  return {
    ...row,
    status: docStatus != null ? docStatus : row.status,
    displayDate,
    viewCount,
    commentCount,
    likeCount,
    statusTag,
    docCardTone,
  };
}

export function normalizeCategoryList(res) {
  if (Array.isArray(res)) return res;
  const d = res && typeof res === 'object' ? res.data : undefined;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.list)) return d.list;
  if (Array.isArray(d?.rows)) return d.rows;
  if (Array.isArray(d?.records)) return d.records;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.categories)) return d.categories;
  if (Array.isArray(res?.list)) return res.list;
  return [];
}

function buildCategoryTreeNodes(list) {
  if (!list || !list.length) return [];
  const nodes = {};
  list.forEach((raw) => {
    const id = raw.id;
    if (id === undefined || id === null) return;
    nodes[id] = {
      id,
      name: raw.name || '未命名',
      parentId: raw.parentId,
      children: [],
    };
  });
  const isRootParentId = (pid) => {
    if (pid === undefined || pid === null || pid === '') return true;
    const s = String(pid).trim().toLowerCase();
    return s === '0' || s === '-1' || s === 'null';
  };
  const roots = [];
  list.forEach((raw) => {
    const id = raw.id;
    if (id === undefined || id === null) return;
    const node = nodes[id];
    const pid = raw.parentId;
    const hasParent = !isRootParentId(pid) && nodes[pid];
    const parent = hasParent ? nodes[pid] : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
  const sortDeep = (arr) => {
    arr.sort(sortName);
    arr.forEach((n) => {
      if (n.children.length) sortDeep(n.children);
    });
  };
  sortDeep(roots);
  return roots;
}

/** 树展平为下拉项：label 为「父 / 子」路径 */
export function buildCategoryDropdownOptions(list) {
  const opts = [{ label: '全部分类', value: '' }];
  if (!list || !list.length) return opts;
  const roots = buildCategoryTreeNodes(list);
  const walk = (nodes, pathPrefix) => {
    nodes.forEach((n) => {
      const label = pathPrefix ? `${pathPrefix} / ${n.name}` : n.name;
      opts.push({ label, value: n.id });
      if (n.children && n.children.length) {
        walk(n.children, pathPrefix ? `${pathPrefix} / ${n.name}` : n.name);
      }
    });
  };
  walk(roots, '');
  return opts;
}

export function computeHasActiveFilter(filterOptions = {}) {
  const fo = filterOptions || {};
  const hasCategory = fo.categoryId !== '' && fo.categoryId !== undefined && fo.categoryId !== null;
  const hasTime = fo.timeRange !== '' && fo.timeRange !== undefined && fo.timeRange !== null;
  return !!(hasCategory || hasTime);
}
