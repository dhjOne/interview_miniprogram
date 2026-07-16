/**
 * 分类兜底 / Cascader / 建议相关工具（与后端 CategoryConstants 对齐）
 */
export const FALLBACK_CATEGORY_NAME = '其他';
export const FALLBACK_CATEGORY_ID = 300;

export function isFallbackCategory(item) {
  if (!item) return false;
  if (item.isFallback === true || item.isFallback === 1 || item.isFallback === 'true') {
    return true;
  }
  const name = String(item.name || item.label || '').trim();
  const id = item.id !== undefined ? item.id : item.value;
  return name === FALLBACK_CATEGORY_NAME || String(id) === String(FALLBACK_CATEGORY_ID);
}

export function isFallbackCategoryId(id, list = []) {
  if (id === undefined || id === null || id === '') return false;
  const hit = (list || []).find((c) => String(c.id) === String(id) || String(c.value) === String(id));
  if (hit) return isFallbackCategory(hit);
  return String(id) === String(FALLBACK_CATEGORY_ID);
}

/**
 * 将接口分类转为 Cascader 节点。
 * 注意：叶子节点不要带 children: []，否则 Cascader 不会收起（会进入空二级）。
 */
export function toCascaderNode(raw, childRows) {
  const node = {
    label: raw.name,
    value: raw.id,
    isFallback: isFallbackCategory(raw)
  };
  if (childRows && childRows.length) {
    node.children = childRows.map((c) => ({
      label: c.name,
      value: c.id,
      isFallback: isFallbackCategory(c)
    }));
  }
  return node;
}

/**
 * 从 Cascader change 事件解析发布所需字段
 */
export function applyCascaderChange(detail) {
  const value = detail && detail.value !== undefined && detail.value !== null ? detail.value : '';
  const selectedOptions = ((detail && detail.selectedOptions) || []).filter(Boolean);
  const labels = selectedOptions
    .map((o) => o.label || o.name || '')
    .map((s) => String(s).trim())
    .filter(Boolean);
  const parentOpt = selectedOptions[0];
  const leafOpt = selectedOptions[selectedOptions.length - 1];
  const isFallback =
    isFallbackCategory(leafOpt) ||
    isFallbackCategory(parentOpt) ||
    isFallbackCategoryId(value);

  return {
    categoryCascaderValue: value,
    selectedCategory: value,
    selectedParentCategory: parentOpt ? parentOpt.value : value || '',
    categoryName: labels.join(' / '),
    isFallback
  };
}

/** 在 Cascader 树中查找叶子，返回路径节点 */
export function findCascaderPath(options, leafId) {
  if (leafId === undefined || leafId === null || leafId === '') return null;
  const idStr = String(leafId);
  const walk = (nodes, path) => {
    if (!nodes || !nodes.length) return null;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const next = path.concat(n);
      if (String(n.value) === idStr) return next;
      if (n.children && n.children.length) {
        const hit = walk(n.children, next);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(options || [], []);
}

/**
 * 按关键字过滤 Cascader 树（匹配一级或二级名称）
 * - 一级命中：保留该一级及其全部二级
 * - 仅二级命中：保留一级 + 命中的二级
 */
export function filterCascaderOptions(options, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return options || [];
  const out = [];
  (options || []).forEach((node) => {
    const label = String(node.label || '').toLowerCase();
    const parentHit = label.includes(kw);
    if (node.children && node.children.length) {
      const kids = node.children.filter((c) =>
        String(c.label || '').toLowerCase().includes(kw)
      );
      if (parentHit) {
        out.push({
          label: node.label,
          value: node.value,
          isFallback: node.isFallback,
          children: node.children.map((c) => ({ ...c }))
        });
      } else if (kids.length) {
        out.push({
          label: node.label,
          value: node.value,
          isFallback: node.isFallback,
          children: kids.map((c) => ({ ...c }))
        });
      }
    } else if (parentHit) {
      out.push({
        label: node.label,
        value: node.value,
        isFallback: node.isFallback
      });
    }
  });
  return out;
}

/** 在树中查找兜底「其他」节点（优先一级叶子） */
export function findFallbackCascaderNode(options) {
  const list = options || [];
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    if (isFallbackCategory(n) && !(n.children && n.children.length)) {
      return { leaf: n, parent: null };
    }
  }
  for (let i = 0; i < list.length; i += 1) {
    const n = list[i];
    if (n.children && n.children.length) {
      for (let j = 0; j < n.children.length; j += 1) {
        const c = n.children[j];
        if (isFallbackCategory(c)) {
          return { leaf: c, parent: n };
        }
      }
    }
  }
  for (let i = 0; i < list.length; i += 1) {
    if (isFallbackCategory(list[i])) {
      return { leaf: list[i], parent: null };
    }
  }
  return null;
}
