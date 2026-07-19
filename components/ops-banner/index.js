Component({
  properties: {
    /** top | feed */
    variant: {
      type: String,
      value: 'feed'
    },
    item: {
      type: Object,
      value: null
    },
    dismissible: {
      type: Boolean,
      value: true
    },
    badgeText: {
      type: String,
      value: '推广'
    }
  },

  methods: {
    onTap() {
      const item = this.data.item;
      if (!item) return;
      this.triggerEvent('tap', { item });
    },

    onDismiss(e) {
      if (e && e.stopPropagation) e.stopPropagation();
      this.triggerEvent('dismiss', { item: this.data.item });
    }
  }
});
