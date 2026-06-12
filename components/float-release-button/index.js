const STORAGE_KEY = 'float_release_fab_fixed_v3';

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
    isDragging: false
  },

  lifetimes: {
    attached() {
      this.setData({ innerShow: this.properties.showButton !== false });
      this._dragSession = null;
      this._dragMoved = false;
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
    }
  },

  methods: {
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
      const marginB = Math.ceil(this._rpxToPx(200, w));

      let fabLeft = Math.round(w - viewW - marginR);
      let fabTop = Math.round(h - viewH - marginB);
      let docked = '';

      try {
        const saved = wx.getStorageSync(STORAGE_KEY);
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
        docked
      });
    },

    _savePosition() {
      try {
        wx.setStorageSync(STORAGE_KEY, {
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
      this.setData({
        docked: side,
        fabLeft: this._dockLeft(side, metrics)
      });
      this._savePosition();
    },

    _expandFromDock() {
      const { docked, winW } = this.data;
      if (!docked) return;
      const metrics = this._getLayoutMetrics(winW);
      this.setData({
        docked: '',
        fabLeft: this._expandedLeft(docked, metrics, winW)
      });
      this._savePosition();
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

      this.setData({ docked: '' });
      this._savePosition();
      return false;
    },

    onDragStart(e) {
      const t = e.touches && e.touches[0];
      if (!t) return;
      this._dragMoved = false;
      this._dragSession = {
        startX: t.clientX,
        startY: t.clientY,
        originLeft: this.data.fabLeft,
        originTop: this.data.fabTop,
        wasDocked: !!this.data.docked
      };
      this.setData({ isDragging: true });
    },

    onDragMove(e) {
      if (!this._dragSession) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dx = t.clientX - this._dragSession.startX;
      const dy = t.clientY - this._dragSession.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this._dragMoved = true;
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

      const patch = { fabLeft: left, fabTop: top };
      if (this._dragSession.wasDocked && this._dragMoved) {
        patch.docked = '';
      }
      this.setData(patch);
    },

    onDragEnd() {
      const session = this._dragSession;
      this._dragSession = null;
      this.setData({ isDragging: false });
      if (!session) return;

      if (this._dragMoved) {
        this._tryDockAfterDrag();
        return;
      }

      if (this.data.docked) {
        this._expandFromDock();
        return;
      }

      this._emitTap();
    },

    _emitTap() {
      this.triggerEvent('onTap');
      const { pagePath } = this.properties;
      if (pagePath) {
        this.navigateToPage();
      }
    },

    navigateToPage() {
      const { pagePath, navigateType } = this.properties;
      if (!pagePath) return;
      const navigatorMap = {
        navigateTo: wx.navigateTo,
        redirectTo: wx.redirectTo,
        switchTab: wx.switchTab,
        reLaunch: wx.reLaunch
      };
      const navigate = navigatorMap[navigateType] || wx.navigateTo;
      navigate({
        url: pagePath,
        fail: (err) => {
          console.error('跳转失败:', err);
          this.triggerEvent('onError', { error: err });
        }
      });
    },

    show() {
      this.setData({ innerShow: true });
    },

    hide() {
      this.setData({ innerShow: false });
    }
  }
});
