const STORAGE_KEY = 'float_release_fab_fixed_v1';

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
      value: 'add'
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
    viewH: 48
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

    _initLayout() {
      const win = getWindowMetrics();
      let w = Number(win.windowWidth) || 0;
      let h = Number(win.windowHeight) || 0;

      if (w < 50 || h < 50) {
        const s = wx.getSystemInfoSync();
        w = Number(s.windowWidth) || 375;
        h = Number(s.windowHeight) || 667;
      }

      const rpx = (n) => this._rpxToPx(n, w);

      const viewW = Math.max(120, Math.ceil(rpx(204)));
      const viewH = Math.max(48, Math.ceil(rpx(88)));
      const marginR = Math.ceil(rpx(24));
      const marginB = Math.ceil(rpx(200));

      let fabLeft = Math.round(w - viewW - marginR);
      let fabTop = Math.round(h - viewH - marginB);

      try {
        const saved = wx.getStorageSync(STORAGE_KEY);
        if (
          saved &&
          typeof saved.left === 'number' &&
          typeof saved.top === 'number' &&
          typeof saved.w === 'number' &&
          typeof saved.h === 'number'
        ) {
          const sameSize =
            Math.abs(saved.w - viewW) < 12 && Math.abs(saved.h - viewH) < 12;
          if (sameSize) {
            fabLeft = this._clamp(
              Math.round(saved.left),
              0,
              Math.max(0, w - viewW)
            );
            fabTop = this._clamp(
              Math.round(saved.top),
              0,
              Math.max(0, h - viewH)
            );
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
        fabTop
      });
    },

    onDragStart(e) {
      const t = e.touches && e.touches[0];
      if (!t) return;
      this._dragMoved = false;
      this._dragSession = {
        startX: t.clientX,
        startY: t.clientY,
        originLeft: this.data.fabLeft,
        originTop: this.data.fabTop
      };
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
      const left = this._clamp(
        Math.round(this._dragSession.originLeft + dx),
        0,
        Math.max(0, winW - viewW)
      );
      const top = this._clamp(
        Math.round(this._dragSession.originTop + dy),
        0,
        Math.max(0, winH - viewH)
      );
      this.setData({ fabLeft: left, fabTop: top });
    },

    onDragEnd() {
      const session = this._dragSession;
      this._dragSession = null;
      if (!session) return;

      if (this._dragMoved) {
        try {
          wx.setStorageSync(STORAGE_KEY, {
            left: this.data.fabLeft,
            top: this.data.fabTop,
            w: this.data.viewW,
            h: this.data.viewH
          });
        } catch (err) {
          // ignore
        }
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
