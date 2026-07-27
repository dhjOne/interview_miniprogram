import { collectFolderApi, unwrapData, handleApiError } from '~/api/index';

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
    /** collect | move */
    mode: {
      type: String,
      value: 'collect',
    },
    selectedFolderId: {
      type: null,
      value: null,
    },
  },

  data: {
    folders: [],
    activeFolderId: null,
    activeFolderName: '',
    loading: false,
    creating: false,
    showCreate: false,
    newFolderName: '',
    confirmText: '确认收藏',
  },

  observers: {
    visible(visible) {
      if (visible) {
        this.setData({
          activeFolderId: this.properties.selectedFolderId || null,
          activeFolderName: '',
          showCreate: false,
          newFolderName: '',
        });
        this.loadFolders();
      }
    },
    selectedFolderId(id) {
      if (this.properties.visible) {
        this.setData({ activeFolderId: id || null });
      }
    },
  },

  methods: {
    _syncConfirmText(folderName) {
      const name = folderName || this.data.activeFolderName || '分类';
      const short = name.length > 8 ? `${name.slice(0, 8)}…` : name;
      const text = this.properties.mode === 'move' ? `移动到「${short}」` : `收藏到「${short}」`;
      this.setData({
        activeFolderName: folderName || this.data.activeFolderName,
        confirmText: text,
      });
    },

    async loadFolders() {
      this.setData({ loading: true });
      try {
        const res = await collectFolderApi.list();
        const folders = (unwrapData(res) || []).map((item) => ({
          ...item,
          id: item.id,
          idKey: String(item.id),
          isDefault: !!(item.isDefault ?? item.default),
          itemCount: item.itemCount ?? item.item_count ?? 0,
        }));

        let activeFolderId = this.data.activeFolderId;
        if (activeFolderId != null) activeFolderId = String(activeFolderId);

        let active = null;
        if (activeFolderId) {
          active = folders.find((f) => f.idKey === activeFolderId) || null;
        }
        if (!active && folders.length) {
          active = folders.find((f) => f.isDefault) || folders[0];
          activeFolderId = active.idKey;
        }

        this.setData({
          folders,
          activeFolderId,
          activeFolderName: active ? active.name : '',
        });
        this._syncConfirmText(active ? active.name : '分类');
      } catch (error) {
        handleApiError(error, { fallbackMessage: '分类加载失败' });
      } finally {
        this.setData({ loading: false });
      }
    },

    onVisibleChange(e) {
      if (!e.detail.visible) {
        this.triggerEvent('close');
      }
    },

    onSelect(e) {
      if (this.data.showCreate) {
        this.setData({ showCreate: false, newFolderName: '' });
      }
      const { id, name } = e.currentTarget.dataset;
      if (id == null || id === '') return;
      this.setData({
        activeFolderId: String(id),
        activeFolderName: name || '',
      });
      this._syncConfirmText(name || '分类');
    },

    onShowCreate() {
      if (this.data.creating) return;
      this.setData({ showCreate: true, newFolderName: '' });
    },

    onCancelCreate() {
      this.setData({ showCreate: false, newFolderName: '' });
    },

    onNameInput(e) {
      const value = e.detail?.value ?? e.detail ?? '';
      this.setData({ newFolderName: typeof value === 'string' ? value : '' });
    },

    onCreateConfirm() {
      const name = (this.data.newFolderName || '').trim();
      this.createFolderAndSelect(name);
    },

    async createFolderAndSelect(name) {
      if (!name) {
        wx.showToast({ title: '请输入分类名称', icon: 'none' });
        return;
      }
      if (name.length > 20) {
        wx.showToast({ title: '最多20个字', icon: 'none' });
        return;
      }

      this.setData({ creating: true });
      try {
        const res = await collectFolderApi.create(
          { name },
          { showLoading: true, loadingText: '创建中...' },
        );
        const folder = unwrapData(res);
        if (!folder || folder.id == null) {
          throw new Error('创建成功但未返回分类信息');
        }

        const next = {
          ...folder,
          id: folder.id,
          idKey: String(folder.id),
          isDefault: !!(folder.isDefault ?? folder.default),
          itemCount: folder.itemCount ?? 0,
          name: folder.name || name,
        };
        const folders = [
          ...this.data.folders.filter((f) => String(f.id) !== String(next.id)),
          next,
        ];
        this.setData({
          folders,
          activeFolderId: String(next.id),
          activeFolderName: next.name,
          showCreate: false,
          newFolderName: '',
        });

        this.triggerEvent('confirm', {
          folderId: next.id,
          folderName: next.name,
          mode: this.properties.mode,
          created: true,
        });
      } catch (error) {
        handleApiError(error, { fallbackMessage: '创建失败' });
      } finally {
        this.setData({ creating: false });
      }
    },

    onConfirm() {
      if (this.data.showCreate) {
        this.onCreateConfirm();
        return;
      }
      const { activeFolderId, folders } = this.data;
      if (!activeFolderId) {
        wx.showToast({ title: '请选择分类', icon: 'none' });
        return;
      }
      const folder = folders.find((f) => String(f.id) === String(activeFolderId));
      this.triggerEvent('confirm', {
        folderId: folder ? folder.id : activeFolderId,
        folderName: folder ? folder.name : '',
        mode: this.properties.mode,
        created: false,
      });
    },
  },
});
