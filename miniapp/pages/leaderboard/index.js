const api = require('../../utils/api');

Page({
  data: {
    videoId: '',
    items: [],
    loading: false
  },

  onLoad(options) {
    this.setData({ videoId: options.videoId || '' });
  },

  onShow() {
    if (this.data.videoId) {
      this.fetchLeaderboard();
    }
  },

  async fetchLeaderboard() {
    this.setData({ loading: true });
    try {
      const res = await api.getLeaderboard(this.data.videoId);
      this.setData({ items: res.items || [] });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
