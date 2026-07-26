import { openPage, redirectPage, switchTabPage, reLaunchPage } from '~/utils/router';

const DEFAULT_STORAGE_KEY = 'float_release_fab_fixed_v3';
const DRAG_THRESHOLD_PX = 12;

function getWindowMetrics() {
  if (wx.getWindowInfo) {
    return wx.getWindowInfo();
  }
  const s = wx.getSystemInfoSync();
  return {
    windowWidth: s.windowWidth,
    windowHeight: s.windowHeight
  };
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const key = item.key || item.value || item.id;
      if (!key) return null;
      return {
        key: String(key),
        text: item.text || item.label || String(key),
        icon: item.icon || 'edit-1'
      };
    })
    .filter(Boolean);
}

Component({
  properties: {
    customClass: {
      type: String,
      value: ''
    },
    customStyle: {
      type: String,
      value: ''
    },
    buttonTheme: {
      type: String,
      value: 'primary'
    },
    buttonSize: {
      type: String,
      value: 'large'
    },
    buttonIcon: {
      type: String,
      value: 'edit-1'
    },
    buttonShape: {
      type: String,
      value: 'round'
    },
    buttonText: {
      type: String,
      value: '发布'
    },
    /** Speed Dial 子动作：[{ key, text, icon }]；有值时主按钮改为展开菜单 */
    actions: {
      type: Array,
      value: []
    },
    /** 独立存储键，避免多个悬浮按钮互相覆盖位置 */
    storageKey: {
      type: String,
      value: DEFAULT_STORAGE_KEY
    },
    /** 距底部默认外边距（rpx） */
    marginBottomRpx: {
      type: Number,
      value: 200
    },
    showButton: {
      type: Boolean,
      value: true,
      observer(newVal) {
        this.setData({ innerShow: newVal !== false });
      }
    },
    pagePath: {
      type: String,
      value: ''
    },
    navigateType: {
      type: String,
      value: 'navigateTo'
    }
  },

  observers: {
    actions(actions) {
      this._syncActions(actions);
    }
  },

  data: {
    innerShow: true,
    fabReady: false,
    winW: 375,
    winH: 667,
    fabLeft: 0,
    fabTop: 0,
    viewW: 130,
    viewH: 48,
    docked: '',
    isDragging: false,
    hasActions: false,
    actionList: [],
    menuOpen: false,
    actionsSide: 'right'
  },

  lifetimes: {
    attached() {
      this.setData({ innerShow: this.properties.showButton !== false });
      this._dragSession = null;
      this._dragMoved = false;
      this._closedMenuOnStart = false;
      this._syncActions(this.properties.actions);
      wx.nextTick(() => {
        this._initLayout();
      });
    }
  },

  pageLifetimes: {
    show() {
      if (!this.data.fabReady) {
        wx.nextTick(() => {
          this._initLayout();
        });
      }
    },
    hide() {
      this._closeMenu();
    }
  },

  methods: {
    _syncActions(rawActions) {
      const actions = normalizeActions(
        rawActions !== undefined ? rawActions : this.properties.actions
      );
      const patch = {
        hasActions: actions.length > 0,
        actionList: actions
      };
      if (!actions.length && this.data.menuOpen) {
        patch.menuOpen = false;
      }
      this.setData(patch);
    },

    _rpxToPx(rpx, windowWidth) {
      return (rpx * windowWidth) / 750;
    },

    _clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    },

    _getLayoutMetrics(w) {
      const rpx = (n) => this._rpxToPx(n, w);
      return {
        viewW: Math.max(56, Math.ceil(rpx(104))),
        viewH: Math.max(96, Math.ceil(rpx(148))),
        edgeThreshold: Math.ceil(rpx(48)),
        peekW: Math.ceil(rpx(32)),
        edgeMargin: Math.ceil(rpx(16))
      };
    },

    _dockLeft(side, metrics) {
      const { viewW, peekW } = metrics;
      return side === 'left' ? -(viewW - peekW) : metrics.winW - peekW;
    },

    _expandedLeft(side, metrics, winW) {
      const { viewW, edgeMargin } = metrics;
      return side === 'left' ? edgeMargin : winW - viewW - edgeMargin;
    },

    _resolveActionsSide(fabLeft, viewW, winW) {
      const center = fabLeft + viewW / 2;
      return center < winW / 2 ? 'left' : 'right';
    },

    _initLayout() {
      const win = getWindowMetrics();
      let w = Number(win.windowWidth) || 0;
      let h = Number(win.windowHeight) || 0;

      if (w < 50 || h < 50) {
        const s = wx.getSystemInfoSync();
        w = Number(s.windowWidth) || 375;
        h = Number(s.windowHeight) || 667;
      }

      const metrics = this._getLayoutMetrics(w);
      metrics.winW = w;
      const { viewW, viewH } = metrics;
      const marginR = Math.ceil(this._rpxToPx(24, w));
      const marginBottomRpx = Number(this.properties.marginBottomRpx) || 200;
      const marginB = Math.ceil(this._rpxToPx(marginBottomRpx, w));
      const storageKey = this.properties.storageKey || DEFAULT_STORAGE_KEY;

      let fabLeft = Math.round(w - viewW - marginR);
      let fabTop = Math.round(h - viewH - marginB);
      let docked = '';

      try {
        const saved = wx.getStorageSync(storageKey);
        if (
          saved &&
          typeof saved.top === 'number' &&
          typeof saved.w === 'number' &&
          typeof saved.h === 'number'
        ) {
          const sameSize =
            Math.abs(saved.w - viewW) < 12 && Math.abs(saved.h - viewH) < 12;
          if (sameSize) {
            fabTop = this._clamp(
              Math.round(saved.top),
              0,
              Math.max(0, h - viewH)
            );
            if (saved.docked === 'left' || saved.docked === 'right') {
              docked = saved.docked;
              fabLeft = this._dockLeft(docked, { ...metrics, winW: w });
            } else if (typeof saved.left === 'number') {
              fabLeft = this._clamp(
                Math.round(saved.left),
                0,
                Math.max(0, w - viewW)
              );
            }
          }
        }
      } catch (e) {
        // ignore
      }

      this.setData({
        fabReady: true,
        winW: w,
        winH: h,
        viewW,
        viewH,
        fabLeft,
        fabTop,
        docked,
        actionsSide: this._resolveActionsSide(fabLeft, viewW, w)
      });
    },

    _savePosition() {
      try {
        wx.setStorageSync(this.properties.storageKey || DEFAULT_STORAGE_KEY, {
          left: this.data.fabLeft,
          top: this.data.fabTop,
          w: this.data.viewW,
          h: this.data.viewH,
          docked: this.data.docked || ''
        });
      } catch (err) {
        // ignore
      }
    },

    _dockTo(side) {
      const metrics = this._getLayoutMetrics(this.data.winW);
      metrics.winW = this.data.winW;
      const fabLeft = this._dockLeft(side, metrics);
      this.setData({
        docked: side,
        fabLeft,
        menuOpen: false,
        actionsSide: side === 'left' ? 'left' : 'right'
      });
      this._savePosition();
    },

    _expandFromDock() {
      const { docked, winW } = this.data;
      if (!docked) return false;
      const metrics = this._getLayoutMetrics(winW);
      const fabLeft = this._expandedLeft(docked, metrics, winW);
      this.setData({
        docked: '',
        fabLeft,
        actionsSide: this._resolveActionsSide(fabLeft, this.data.viewW, winW)
      });
      this._savePosition();
      return true;
    },

    _tryDockAfterDrag() {
      const { fabLeft, winW, viewW } = this.data;
      const { edgeThreshold } = this._getLayoutMetrics(winW);

      if (fabLeft <= edgeThreshold) {
        this._dockTo('left');
        return true;
      }
      if (fabLeft >= winW - viewW - edgeThreshold) {
        this._dockTo('right');
        return true;
      }

      this.setData({
        docked: '',
        actionsSide: this._resolveActionsSide(fabLeft, viewW, winW)
      });
      this._savePosition();
      return false;
    },

    _closeMenu() {
      if (!this.data.menuOpen) return;
      this.setData({ menuOpen: false });
    },

    _hasSpeedDial() {
      if (this.data.hasActions && this.data.actionList.length > 0) {
        return true;
      }
      return normalizeActions(this.properties.actions).length > 0;
    },

    _openMenu() {
      const actions = normalizeActions(this.properties.actions);
      if (!actions.length) {
        this._emitTap();
        return;
      }
      this.setData({
        hasActions: true,
        actionList: actions,
        menuOpen: true,
        actionsSide: this._resolveActionsSide(
          this.data.fabLeft,
          this.data.viewW,
          this.data.winW
        )
      });
    },

    _handlePrimaryTap() {
      if (this._hasSpeedDial()) {
        if (this.data.menuOpen) {
          this._closeMenu();
          return;
        }
        this._openMenu();
        return;
      }
      this._emitTap();
    },

    onDragStart(e) {
      const t = e.touches && e.touches[0];
      if (!t) return;
      this._dragMoved = false;
      this._closedMenuOnStart = !!this.data.menuOpen;
      this._dragSession = {
        startX: t.clientX,
        startY: t.clientY,
        originLeft: this.data.fabLeft,
        originTop: this.data.fabTop,
        wasDocked: !!this.data.docked
      };
      // 展开菜单时按下主按钮：先记下，抬手再决定是收起还是拖走
      this.setData({ isDragging: false });
    },

    onDragMove(e) {
      if (!this._dragSession) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dx = t.clientX - this._dragSession.startX;
      const dy = t.clientY - this._dragSession.startY;
      const distance = Math.abs(dx) + Math.abs(dy);

      if (!this._dragMoved && distance < DRAG_THRESHOLD_PX) {
        return;
      }

      if (!this._dragMoved) {
        this._dragMoved = true;
        if (this.data.menuOpen) {
          this._closeMenu();
        }
        this.setData({ isDragging: true });
      }

      const { winW, winH, viewW, viewH } = this.data;
      const metrics = this._getLayoutMetrics(winW);
      const minLeft = -(viewW - metrics.peekW);
      const maxLeft = winW - metrics.peekW;

      const left = this._clamp(
        Math.round(this._dragSession.originLeft + dx),
        minLeft,
        maxLeft
      );
      const top = this._clamp(
        Math.round(this._dragSession.originTop + dy),
        0,
        Math.max(0, winH - viewH)
      );

      const patch = {
        fabLeft: left,
        fabTop: top,
        actionsSide: this._resolveActionsSide(left, viewW, winW)
      };
      if (this._dragSession.wasDocked) {
        patch.docked = '';
      }
      this.setData(patch);
    },

    onDragEnd() {
      const session = this._dragSession;
      const closedMenuOnStart = this._closedMenuOnStart;
      this._dragSession = null;
      this._closedMenuOnStart = false;
      this.setData({ isDragging: false });
      if (!session) return;

      if (this._dragMoved) {
        this._tryDockAfterDrag();
        return;
      }

      // 菜单已展开时再点主按钮：收起
      if (closedMenuOnStart) {
        this._closeMenu();
        return;
      }

      if (this.data.docked) {
        this._expandFromDock();
        // 贴边展开后直接打开菜单，避免「点了没反应」的错觉
        if (this._hasSpeedDial()) {
          setTimeout(() => this._openMenu(), 40);
        }
        return;
      }

      this._handlePrimaryTap();
    },

    onMaskTap() {
      this._closeMenu();
    },

    onActionTap(e) {
      const key = e.currentTarget.dataset.key;
      if (!key) return;
      this._closeMenu();
      this.triggerEvent('onAction', { key });
      // 兼容 bind:action / bindaction
      this.triggerEvent('action', { key });
    },

    _emitTap() {
      this.triggerEvent('onTap');
      this.triggerEvent('tap');
      const { pagePath } = this.properties;
      if (pagePath) {
        this.navigateToPage();
      }
    },

    navigateToPage() {
      const { pagePath, navigateType } = this.properties;
      if (!pagePath) return;
      const navigatorMap = {
        navigateTo: openPage,
        redirectTo: redirectPage,
        switchTab: switchTabPage,
        reLaunch: reLaunchPage
      };
      const navigate = navigatorMap[navigateType] || openPage;
      const result = navigate({
        url: pagePath,
        fail: (err) => {
          console.error('跳转失败:', err);
          this.triggerEvent('onError', { error: err });
        }
      });
      if (result && typeof result.catch === 'function') {
        result.catch((err) => {
          console.error('跳转失败:', err);
          this.triggerEvent('onError', { error: err });
        });
      }
    },

    show() {
      this.setData({ innerShow: true });
    },

    hide() {
      this.setData({ innerShow: false, menuOpen: false });
    }
  }
});
