import { categoryApi, handleApiError } from '~/api/index';
import { CategoryParams, CategorySuggestParams } from '~/api/param/param_category';
import {
  isFallbackCategory,
  isFallbackCategoryId,
  toCascaderNode,
  applyCascaderChange,
  findCascaderPath,
  searchCascaderFlat,
  resolveCascaderSelection,
  findFallbackCascaderNode
} from '~/utils/categorySuggest';

/**
 * 发布页 / 文档编辑页共用的分类 Cascader（加载、搜索、选中、「其他」建议）。
 * 选中后若页面实现了 updatePreviewContent / persistDraftLocal，会可选调用。
 */
const categoryCascaderBehavior = Behavior({
  data: {
    selectedCategory: '',
    /** 一级分类（兼容草稿/详情解析） */
    categoryLevel1: [],
    /** 当前一级下的二级分类（兼容旧逻辑，Cascader 树优先） */
    categoryLevel2: [],
    /** 当前选中的一级 id */
    selectedParentCategory: '',
    /** Cascader 全量树 */
    categoryCascaderOptionsAll: [],
    /** Cascader 展示用树（搜索时保持全量，避免改写 options 导致内部选中索引错乱） */
    categoryCascaderOptions: [],
    categoryCascaderVisible: false,
    categoryCascaderValue: '',
    categoryCascaderKeyword: '',
    /** 搜索扁平结果（独立列表选中，不经 Cascader 内部状态） */
    categoryCascaderSearchResults: [],
    categoryCascaderSubTitles: ['选择一级分类', '选择二级分类'],
    /** 分类列表加载中 */
    categoryLoading: false,
    /** 级联内：找不到分类联动面板 */
    showCascaderMissPanel: false,
    /** 级联内建议名草稿（确认后写入 categorySuggestName） */
    cascaderMissSuggest: '',
    /** 当前是否选中兜底「其他」（表单精简回显） */
    isFallbackCategorySelected: false,
    /** 用户建议的分类名称（选「其他」时必填） */
    categorySuggestName: '',
    /** 分类名称缓存 / 预览展示 */
    categoryName: ''
  },

  lifetimes: {
    attached() {
      if (!this.categorySubCache) {
        this.categorySubCache = {};
      }
    }
  },

  methods: {
    _categoryRowsFromResponse(res) {
      const d = res && typeof res === 'object' ? res.data : undefined;
      if (Array.isArray(d?.rows)) return d.rows;
      if (Array.isArray(res?.rows)) return res.rows;
      if (Array.isArray(d)) return d;
      return [];
    },

    /** 分类 UI 变更后：刷新预览；编辑页可额外落草稿 */
    _afterCategoryUiUpdate() {
      this.updatePreviewContent && this.updatePreviewContent();
      this.persistDraftLocal && this.persistDraftLocal();
    },

    async fetchSubCategories(parentId) {
      if (!this.categorySubCache) {
        this.categorySubCache = {};
      }
      if (this.categorySubCache[parentId]) {
        return this.categorySubCache[parentId];
      }
      const categoryParams = new CategoryParams(null, parentId);
      categoryParams.sortField = 'sort_order';
      categoryParams.order = 'asc';
      categoryParams.limit = -1;
      const response = await categoryApi.getCategories(categoryParams);
      const rows = this._categoryRowsFromResponse(response);
      this.categorySubCache[parentId] = rows;
      return rows;
    },

    /** 拉取一级 + 二级，组装 Cascader 树（叶子不带空 children） */
    async loadLevel1Categories() {
      this.setData({ categoryLoading: true });
      try {
        const rows = await this.fetchSubCategories(0);
        const options = await Promise.all(
          rows.map(async (parent) => {
            let children = [];
            try {
              children = await this.fetchSubCategories(parent.id);
            } catch (e) {
              console.error('fetchSubCategories', parent.id, e);
            }
            return toCascaderNode(parent, children);
          })
        );
        this.setData({
          categoryLevel1: rows,
          categoryCascaderOptionsAll: options,
          categoryCascaderOptions: options,
          categoryCascaderKeyword: '',
          categoryLoading: false
        });
      } catch (e) {
        console.error('loadLevel1Categories', e);
        handleApiError(e, { fallbackMessage: '分类加载失败' });
        this.setData({
          categoryLevel1: [],
          categoryCascaderOptionsAll: [],
          categoryCascaderOptions: [],
          categoryCascaderKeyword: '',
          categoryLoading: false
        });
      }
    },

    retryLoadCategories() {
      this.categorySubCache = {};
      this.loadLevel1Categories();
    },

    noop() {},

    openCategoryCascader() {
      if (this.data.categoryLoading) return;
      const all = this.data.categoryCascaderOptionsAll || [];
      if (!all.length) {
        wx.showToast({ title: '暂无分类', icon: 'none' });
        return;
      }
      const isFallback = !!this.data.isFallbackCategorySelected;
      this.setData({
        categoryCascaderVisible: true,
        categoryCascaderKeyword: '',
        categoryCascaderSearchResults: [],
        // 已选「其他」时直接进入建议面板，方便改建议名
        showCascaderMissPanel: isFallback,
        cascaderMissSuggest: this.data.categorySuggestName || '',
        categoryCascaderOptions: all,
        categoryCascaderValue: isFallback ? '' : this.data.selectedCategory || ''
      });
    },

    /** 直接打开级联并进入「找不到分类」面板 */
    openCategoryCascaderMiss() {
      if (this.data.categoryLoading) return;
      const all = this.data.categoryCascaderOptionsAll || [];
      if (!all.length) {
        wx.showToast({ title: '暂无分类', icon: 'none' });
        return;
      }
      this.setData({
        categoryCascaderVisible: true,
        categoryCascaderKeyword: '',
        categoryCascaderSearchResults: [],
        showCascaderMissPanel: true,
        cascaderMissSuggest: this.data.categorySuggestName || '',
        categoryCascaderOptions: all,
        categoryCascaderValue: ''
      });
    },

    closeCategoryCascader(e) {
      // 业务侧主动选中关闭时，忽略 Cascader/Popup 回抛的 close，避免竞态覆盖
      if (this._cascaderClosingBySelect) return;
      // 选中完成会先 change 再 close；此处若再 setData 会与 change 竞态，把选中值盖掉
      const trigger = e && e.detail && e.detail.trigger;
      if (trigger === 'finish') return;

      const all = this.data.categoryCascaderOptionsAll || this.data.categoryCascaderOptions || [];
      this.setData({
        categoryCascaderVisible: false,
        categoryCascaderKeyword: '',
        categoryCascaderSearchResults: [],
        showCascaderMissPanel: false,
        categoryCascaderOptions: all,
        categoryCascaderValue: this.data.selectedCategory || ''
      });
    },

    onCategoryCascaderSearch(e) {
      const keyword = (e.detail && (e.detail.value !== undefined ? e.detail.value : e.detail)) || '';
      const kw = String(keyword);
      const all = this.data.categoryCascaderOptionsAll || [];
      const trimmed = kw.trim();
      // 搜索时临时清空 Cascader value，避免底部 tabs 仍显示上次选中路径；表单 selectedCategory 保持不变
      this.setData({
        categoryCascaderKeyword: kw,
        categoryCascaderSearchResults: trimmed ? searchCascaderFlat(all, trimmed) : [],
        categoryCascaderValue: trimmed ? '' : this.data.selectedCategory || '',
        showCascaderMissPanel: false
      });
    },

    onCategoryCascaderSearchClear() {
      this.setData({
        categoryCascaderKeyword: '',
        categoryCascaderSearchResults: [],
        categoryCascaderValue: this.data.selectedCategory || ''
      });
    },

    openCascaderMissPanel() {
      const kw = String(this.data.categoryCascaderKeyword || '').trim();
      const suggest =
        String(this.data.cascaderMissSuggest || '').trim() ||
        String(this.data.categorySuggestName || '').trim() ||
        (kw && kw !== '其他' ? kw : '');
      this.setData({
        showCascaderMissPanel: true,
        cascaderMissSuggest: suggest,
        categoryCascaderValue: ''
      });
    },

    closeCascaderMissPanel() {
      const suggest = String(this.data.categorySuggestName || '').trim();
      const patch = {
        showCascaderMissPanel: false,
        categoryCascaderValue: this.data.selectedCategory || ''
      };
      // 尚未确认建议名时，取消本次临时选中的「其他」
      if (this.data.isFallbackCategorySelected && !suggest) {
        patch.selectedCategory = '';
        patch.selectedParentCategory = '';
        patch.categoryName = '';
        patch.isFallbackCategorySelected = false;
        patch.categoryCascaderValue = '';
      }
      this.setData(patch, () => this._afterCategoryUiUpdate());
    },

    onCascaderMissSuggestChange(e) {
      const value = (e.detail && e.detail.value) || '';
      this.setData({ cascaderMissSuggest: String(value) });
    },

    /** 搜索结果直接选中并回写（不依赖 Cascader change） */
    onCategorySearchResultTap(e) {
      const value = e.currentTarget.dataset.value;
      if (value === undefined || value === null || value === '') return;
      const all = this.data.categoryCascaderOptionsAll || [];
      const patch = resolveCascaderSelection(all, { value });
      if (!patch.categoryName && !patch.selectedCategory) {
        wx.showToast({ title: '分类无效，请重试', icon: 'none' });
        return;
      }
      const data = {
        categoryCascaderVisible: false,
        categoryCascaderKeyword: '',
        categoryCascaderSearchResults: [],
        showCascaderMissPanel: false,
        categoryCascaderOptions: all,
        categoryCascaderValue: patch.categoryCascaderValue,
        selectedCategory: patch.selectedCategory,
        selectedParentCategory: patch.selectedParentCategory,
        categoryName: patch.categoryName,
        categoryLevel2: [],
        isFallbackCategorySelected: !!patch.isFallback
      };
      if (patch.isFallback) {
        // 搜索命中「其他」→ 进入建议面板，不直接关闭
        this.setData(
          {
            categoryCascaderKeyword: '',
            categoryCascaderSearchResults: [],
            showCascaderMissPanel: true,
            cascaderMissSuggest:
              String(this.data.categorySuggestName || '').trim() ||
              String(this.data.cascaderMissSuggest || '').trim(),
            categoryCascaderValue: '',
            selectedCategory: patch.selectedCategory,
            selectedParentCategory: patch.selectedParentCategory,
            categoryName: patch.categoryName,
            isFallbackCategorySelected: true
          },
          () => this._afterCategoryUiUpdate()
        );
        return;
      }
      data.categorySuggestName = '';
      this._cascaderClosingBySelect = true;
      this.setData(data, () => {
        this._cascaderClosingBySelect = false;
        this._afterCategoryUiUpdate();
      });
    },

    /** 级联内确认：选用「其他」+ 建议名 */
    onConfirmCascaderMiss() {
      const all = this.data.categoryCascaderOptionsAll || this.data.categoryCascaderOptions || [];
      const hit = findFallbackCascaderNode(all);
      if (!hit || !hit.leaf) {
        wx.showToast({ title: '暂无「其他」分类，请联系客服', icon: 'none' });
        return;
      }
      const suggest = String(this.data.cascaderMissSuggest || '').trim();
      if (!suggest) {
        wx.showToast({ title: '请填写建议分类名称', icon: 'none' });
        return;
      }
      const selectedOptions = hit.parent
        ? [
            { label: hit.parent.label, value: hit.parent.value },
            { label: hit.leaf.label, value: hit.leaf.value }
          ]
        : [{ label: hit.leaf.label, value: hit.leaf.value }];
      const patch = applyCascaderChange({
        value: hit.leaf.value,
        selectedOptions
      });
      this._cascaderClosingBySelect = true;
      this.setData(
        {
          categoryCascaderVisible: false,
          categoryCascaderKeyword: '',
          categoryCascaderSearchResults: [],
          showCascaderMissPanel: false,
          categoryCascaderOptions: all,
          categoryCascaderValue: patch.categoryCascaderValue,
          selectedCategory: patch.selectedCategory,
          selectedParentCategory: patch.selectedParentCategory,
          categoryName: suggest ? `${patch.categoryName}（建议：${suggest}）` : patch.categoryName,
          categoryLevel2: [],
          isFallbackCategorySelected: true,
          categorySuggestName: suggest,
          cascaderMissSuggest: suggest
        },
        () => {
          this._cascaderClosingBySelect = false;
          this._afterCategoryUiUpdate();
          wx.showToast({
            title: '已选「其他」，建议已保存',
            icon: 'none',
            duration: 2000
          });
        }
      );
    },

    onCategoryCascaderChange(e) {
      const all = this.data.categoryCascaderOptionsAll || [];
      // 始终用全量树解析路径，避免二次选择时 selectedOptions 不完整
      const patch = resolveCascaderSelection(all, e.detail || {});
      const data = {
        categoryCascaderVisible: false,
        categoryCascaderKeyword: '',
        categoryCascaderSearchResults: [],
        showCascaderMissPanel: false,
        categoryCascaderOptions: all,
        categoryCascaderValue: patch.categoryCascaderValue,
        selectedCategory: patch.selectedCategory,
        selectedParentCategory: patch.selectedParentCategory,
        categoryName: patch.categoryName,
        categoryLevel2: [],
        isFallbackCategorySelected: !!patch.isFallback
      };
      if (patch.isFallback) {
        // 从列表直接点到「其他」→ 打开级联内建议面板，而不是直接关掉
        data.categoryCascaderVisible = true;
        data.showCascaderMissPanel = true;
        data.cascaderMissSuggest =
          String(this.data.categorySuggestName || '').trim() ||
          String(this.data.cascaderMissSuggest || '').trim();
        data.categoryCascaderValue = '';
      } else {
        data.categorySuggestName = '';
      }
      if (patch.isFallback) {
        // 不走关闭竞态标记：面板仍打开
        this.setData(data, () => this._afterCategoryUiUpdate());
        return;
      }
      this._cascaderClosingBySelect = true;
      this.setData(data, () => {
        this._cascaderClosingBySelect = false;
        this._afterCategoryUiUpdate();
      });
    },

    onCategorySuggestChange(e) {
      const value = (e.detail && e.detail.value) || '';
      this.setData({ categorySuggestName: String(value) }, () => {
        this._afterCategoryUiUpdate();
      });
    },

    onCategoryContact() {
      // 客服会话由 open-type=contact 打开；此处仅作兜底提示
    },

    /**
     * 根据 categoryId 解析一级/二级选中态（供草稿/详情兼容）
     * @returns {Promise<object|null>} setData 用的 patch，或 null
     */
    async resolveCategorySelection(categoryId, fallbackName) {
      if (categoryId === undefined || categoryId === null || String(categoryId).trim() === '') {
        return null;
      }
      const idStr = String(categoryId);
      const rows1 = this.data.categoryLevel1 || [];
      if (!rows1.length) {
        return fallbackName
          ? {
              selectedParentCategory: '',
              categoryLevel2: [],
              selectedCategory: categoryId,
              categoryName: fallbackName
            }
          : null;
      }

      const hit1 = rows1.find((c) => String(c.id) === idStr);
      if (hit1) {
        const sub = await this.fetchSubCategories(hit1.id);
        const leafId = sub.length ? '' : hit1.id;
        const categoryName = sub.length && fallbackName ? fallbackName : hit1.name;
        return {
          selectedParentCategory: hit1.id,
          categoryLevel2: sub,
          selectedCategory: leafId,
          categoryName
        };
      }

      for (const p of rows1) {
        const sub = await this.fetchSubCategories(p.id);
        const child = sub.find((c) => String(c.id) === idStr);
        if (child) {
          return {
            selectedParentCategory: p.id,
            categoryLevel2: sub,
            selectedCategory: child.id,
            categoryName: `${p.name} / ${child.name}`
          };
        }
      }

      if (fallbackName) {
        return {
          selectedParentCategory: '',
          categoryLevel2: [],
          selectedCategory: categoryId,
          categoryName: fallbackName
        };
      }
      return null;
    },

    /** 根据已选叶子 id 回填 Cascader value / 路径文案 */
    syncCascaderFromSelection(categoryId, fallbackName) {
      const id = categoryId === undefined || categoryId === null ? '' : categoryId;
      const path = findCascaderPath(
        this.data.categoryCascaderOptionsAll || this.data.categoryCascaderOptions,
        id
      );
      const categoryName =
        path && path.length
          ? path.map((n) => n.label).join(' / ')
          : fallbackName || this.data.categoryName || '';
      const isFallback =
        (path && path.some((n) => isFallbackCategory(n))) || isFallbackCategoryId(id);
      return {
        categoryCascaderValue: id,
        categoryName,
        isFallbackCategorySelected: !!isFallback
      };
    },

    /** 当前发布分类是否为兜底「其他」 */
    _isSelectedFallbackCategory() {
      const { selectedCategory, categoryCascaderOptions, categoryCascaderOptionsAll } = this.data;
      if (isFallbackCategoryId(selectedCategory)) return true;
      const path = findCascaderPath(
        categoryCascaderOptionsAll || categoryCascaderOptions,
        selectedCategory
      );
      if (path && path.length) {
        return path.some((n) => isFallbackCategory(n));
      }
      return false;
    },

    /** 有建议名时提交独立建议接口（选「其他」时必填，已在 validateForm 校验） */
    async submitCategorySuggestIfNeeded() {
      const name = String(this.data.categorySuggestName || '').trim();
      if (!name) return null;
      const parentId = this._isSelectedFallbackCategory()
        ? null
        : this.data.selectedParentCategory || null;
      const params = new CategorySuggestParams({
        suggestedName: name,
        parentId,
        fallbackCategoryId: this.data.selectedCategory || null,
        // 编辑页有 editDocId；发布页无则为 null
        questionId: this.data.editDocId || null,
        reason: this._isSelectedFallbackCategory() ? '选用兜底分类「其他」发布' : ''
      });
      return categoryApi.suggestCategory(params);
    }
  }
});

export default categoryCascaderBehavior;
