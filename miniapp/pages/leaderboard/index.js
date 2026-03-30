const api = require('../../utils/api');

Page({
  data: {
    videoId: '',
    currentUserId: '',
    items: [],
    myEntry: null,
    myRank: null,
    loading: false
  },

  onLoad(options) {
    this.setData({
      videoId: options.videoId || '',
      currentUserId: wx.getStorageSync('pk_user_id') || ''
    });
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
      const items = res.items || [];
      const myRankIndex = items.findIndex((item) => item.user_id === this.data.currentUserId);
      this.setData({
        items,
        myEntry: myRankIndex >= 0 ? items[myRankIndex] : null,
        myRank: myRankIndex >= 0 ? myRankIndex + 1 : null
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
