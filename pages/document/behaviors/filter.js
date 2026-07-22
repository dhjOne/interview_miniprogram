import { questionApi } from '~/api/index';
import {
  buildCategoryDropdownOptions,
  computeHasActiveFilter,
  normalizeCategoryList,
} from '~/utils/documentList';

/**
 * 发布文档列表：筛选面板 + 分类下拉
 * 依赖页面：loadDocList
 */
const documentFilterBehavior = Behavior({
  data: {
    filterVisible: false,
    hasActiveFilter: false,
    filterOptions: {
      categoryId: '',
      timeRange: '',
      tag: '',
    },
    categoryDropdownOptions: [{ label: '全部分类', value: '' }],
    categoryBarTitle: '全部分类',
    categoryDropdownOpen: false,
    timeRanges: [
      { label: '全部时间', value: '' },
      { label: '今天', value: 'today' },
      { label: '近7天', value: 'week' },
      { label: '近30天', value: 'month' },
    ],
  },

  methods: {
    _updateCategoryBarTitle() {
      const id = this.data.filterOptions.categoryId;
      const opts = this.data.categoryDropdownOptions || [];
      if (id === '' || id === undefined || id === null) {
        this.setData({ categoryBarTitle: '全部分类' });
        return;
      }
      const hit = opts.find((o) => o.value == id);
      if (!hit) {
        this.setData({ categoryBarTitle: '全部分类' });
        return;
      }
      const raw = hit.label;
      const max = 18;
      const short = raw.length > max ? `${raw.slice(0, max)}…` : raw;
      this.setData({ categoryBarTitle: short });
    },

    toggleCategoryDropdown() {
      this.setData({
        categoryDropdownOpen: !this.data.categoryDropdownOpen,
      });
    },

    onCategoryOptionTap(e) {
      const idx = Number(e.currentTarget.dataset.index);
      const opts = this.data.categoryDropdownOptions || [];
      const item = opts[idx];
      if (!item) return;
      this.setData(
        {
          'filterOptions.categoryId':
            item.value === undefined || item.value === null ? '' : item.value,
          categoryDropdownOpen: false,
        },
        () => {
          this._updateCategoryBarTitle();
        },
      );
    },

    async getCategories() {
      try {
        const res = await questionApi.getPublishDocCategories();
        const list = normalizeCategoryList(res);
        const categoryDropdownOptions = buildCategoryDropdownOptions(list);
        this.setData({ categoryDropdownOptions }, () => {
          this._updateCategoryBarTitle();
        });
      } catch (error) {
        console.error('获取分类失败:', error);
        this.setData({
          categoryDropdownOptions: [{ label: '全部分类', value: '' }],
          categoryBarTitle: '全部分类',
        });
      }
    },

    onFilterClick() {
      this.setData({ filterVisible: true, categoryDropdownOpen: false }, () => {
        this._updateCategoryBarTitle();
      });
    },

    onFilterChange(e) {
      const { key, value } = e.currentTarget.dataset;
      this.setData({
        [`filterOptions.${key}`]: value,
      });
    },

    onConfirmFilter() {
      this.setData({
        filterVisible: false,
        hasActiveFilter: computeHasActiveFilter(this.data.filterOptions),
      });
      this.loadDocList(true);
    },

    onResetFilter() {
      this.setData(
        {
          filterOptions: {
            categoryId: '',
            timeRange: '',
            tag: '',
          },
          categoryDropdownOpen: false,
        },
        () => {
          this._updateCategoryBarTitle();
        },
      );
    },

    onCloseFilter() {
      this.setData({ filterVisible: false, categoryDropdownOpen: false });
    },
  },
});

export default documentFilterBehavior;
