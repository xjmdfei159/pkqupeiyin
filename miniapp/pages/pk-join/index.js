const api = require('../../utils/api');
const { getOrCreateUserId } = require('../../utils/user');

Page({
  data: {
    userId: '',
    shareCode: '',
    joining: false,
    joined: {},
    invitationInfo: null,
    loadingInvitation: false
  },

  onLoad(options) {
    this.setData({
      userId: getOrCreateUserId(),
      shareCode: options.shareCode || ''
    });
    if (this.data.shareCode) {
      this.fetchInvitationInfo();
    }
  },

  onInputCode(e) {
    this.setData({ shareCode: (e.detail.value || '').trim().toUpperCase() });
  },

  onBlurCode() {
    this.fetchInvitationInfo();
  },

  async fetchInvitationInfo() {
    if (!this.data.shareCode) {
      return;
    }
    this.setData({ loadingInvitation: true });
    try {
      const invitationInfo = await api.getPkInvitation(this.data.shareCode);
      this.setData({ invitationInfo });
    } catch (error) {
      wx.showToast({ title: error.message || '邀请码无效', icon: 'none' });
    } finally {
      this.setData({ loadingInvitation: false });
    }
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
