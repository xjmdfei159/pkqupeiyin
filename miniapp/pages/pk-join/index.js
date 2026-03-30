const api = require('../../utils/api');
const { getOrCreateUserId } = require('../../utils/user');

Page({
  data: {
    userId: '',
    shareCode: '',
    joining: false,
    joined: {}
  },

  onLoad(options) {
    this.setData({
      userId: getOrCreateUserId(),
      shareCode: options.shareCode || ''
    });
  },

  onInputCode(e) {
    this.setData({ shareCode: (e.detail.value || '').trim().toUpperCase() });
  },

  async joinPk() {
    if (!this.data.shareCode) {
      wx.showToast({ title: '请输入分享码', icon: 'none' });
      return;
    }

    this.setData({ joining: true });
    try {
      const joined = await api.joinPkInvitation(this.data.shareCode, {
        user_id: this.data.userId
      });
      this.setData({ joined });
      wx.showToast({ title: '加入成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '加入失败', icon: 'none' });
    } finally {
      this.setData({ joining: false });
    }
  },

  goVideo() {
    if (!this.data.joined.video_id) {
      return;
    }
    wx.navigateTo({
      url: `/pages/video-detail/index?videoId=${this.data.joined.video_id}`
    });
  }
});
