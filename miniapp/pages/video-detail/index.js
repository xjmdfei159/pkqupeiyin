const api = require('../../utils/api');
const { getOrCreateUserId } = require('../../utils/user');

Page({
  data: {
    videoId: '',
    userId: '',
    video: {},
    lines: [],
    result: {},
    invite: {},
    submitting: false
  },

  onLoad(options) {
    this.setData({
      videoId: options.videoId || '',
      userId: getOrCreateUserId()
    });
    if (this.data.videoId) {
      this.fetchVideo();
    }
  },

  async fetchVideo() {
    try {
      const video = await api.getVideo(this.data.videoId);
      const lines = (video.subtitles || []).map((line) => ({
        line_id: line.line_id,
        expected_text: line.expected_text,
        spoken_text: ''
      }));
      this.setData({ video, lines });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  onLineInput(e) {
    const { lineId } = e.currentTarget.dataset;
    const value = e.detail.value;
    const lines = this.data.lines.map((line) => {
      if (line.line_id === lineId) {
        return { ...line, spoken_text: value };
      }
      return line;
    });
    this.setData({ lines });
  },

  async submitDubbing() {
    this.setData({ submitting: true });
    try {
      const payload = {
        user_id: this.data.userId,
        video_id: this.data.videoId,
        lines: this.data.lines.map((line) => ({
          line_id: line.line_id,
          spoken_text: line.spoken_text || ''
        }))
      };
      const result = await api.submitDubbing(payload);
      this.setData({ result });
      wx.showToast({ title: '评分完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async createInvitation() {
    try {
      const invite = await api.createPkInvitation({
        user_id: this.data.userId,
        video_id: this.data.videoId
      });
      this.setData({ invite });
      wx.showToast({ title: '已生成邀请码', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '创建失败', icon: 'none' });
    }
  },

  goLeaderboard() {
    wx.navigateTo({
      url: `/pages/leaderboard/index?videoId=${this.data.videoId}`
    });
  }
});
