const api = require('../../utils/api');
const { getOrCreateUserId } = require('../../utils/user');

Page({
  data: {
    userId: '',
    videos: [],
    loading: false
  },

  onShow() {
    this.setData({ userId: getOrCreateUserId() });
    this.fetchVideos();
  },

  async fetchVideos() {
    this.setData({ loading: true });
    try {
      const res = await api.getVideos();
      this.setData({ videos: res.items || [] });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const { videoId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/video-detail/index?videoId=${videoId}`
    });
  },

  goLeaderboard(e) {
    const { videoId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/leaderboard/index?videoId=${videoId}`
    });
  }
});
