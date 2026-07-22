const LIST_ICON_NAMES = [
  'code',
  'book',
  'chart-bubble',
  'wifi',
  'server',
  'layers',
  'mobile',
  'chat',
  'user',
  'file',
  'cpu',
  'logo-miniprogram',
  'system-sum',
  'root-list',
  'secured',
  'cloud',
];

const LIST_ICON_COLORS = [
  '#0052d9',
  '#366ef4',
  '#00a870',
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#db2777',
  '#059669',
];

const LIST_ICON_BGS = [
  'rgba(0, 82, 217, 0.08)',
  'rgba(54, 110, 244, 0.08)',
  'rgba(0, 168, 112, 0.08)',
  'rgba(124, 58, 237, 0.08)',
  'rgba(8, 145, 178, 0.08)',
  'rgba(234, 88, 12, 0.08)',
  'rgba(219, 39, 119, 0.08)',
  'rgba(5, 150, 105, 0.08)',
];

function hashSeed(value) {
  const str = String(value ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** 为分类行补充列表图标样式字段 */
export function decorateCategoryRows(rows) {
  return (rows || []).map((row) => {
    const seed = hashSeed(row.id ?? row.name ?? 0);
    const index = seed % LIST_ICON_NAMES.length;
    const colorIndex = seed % LIST_ICON_COLORS.length;
    return {
      ...row,
      listIconName: LIST_ICON_NAMES[index],
      listIconColor: LIST_ICON_COLORS[colorIndex],
      listIconBg: LIST_ICON_BGS[colorIndex],
    };
  });
}

export const CATEGORY_SCOPE_INTENT_KEY = 'category_pending_scope';
