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
    submitting: false,
    recordingLineId: '',
    recorderReady: false
  },

  onLoad(options) {
    this.setData({
      videoId: options.videoId || '',
      userId: getOrCreateUserId()
    });
    this.initRecorder();
    if (this.data.videoId) {
      this.fetchVideo();
    }
  },

  onUnload() {
    if (this.recorderManager) {
      this.recorderManager.stop();
    }
  },

  initRecorder() {
    const recorder = wx.getRecorderManager();
    this.recorderManager = recorder;
    this.setData({ recorderReady: true });

    recorder.onStop(async (res) => {
      const lineId = this.data.recordingLineId;
      if (!lineId) {
        return;
      }
      this.setData({ recordingLineId: '' });
      await this.uploadLineAudio(lineId, res.tempFilePath);
    });

    recorder.onError(() => {
      this.setData({ recordingLineId: '' });
      wx.showToast({ title: '录音失败，请重试', icon: 'none' });
    });
  },

  async fetchVideo() {
    try {
      const video = await api.getVideo(this.data.videoId);
      const lines = (video.subtitles || []).map((line) => ({
        line_id: line.line_id,
        expected_text: line.expected_text,
        spoken_text: '',
        line_score: null,
        audio_uploaded: false
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

  startRecord(e) {
    if (!this.data.recorderReady) {
      wx.showToast({ title: '录音器尚未就绪', icon: 'none' });
      return;
    }
    const { lineId } = e.currentTarget.dataset;
    if (this.data.recordingLineId) {
      wx.showToast({ title: '正在录音中', icon: 'none' });
      return;
    }

    this.setData({ recordingLineId: lineId });
    this.recorderManager.start({
      duration: 8000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 64000,
      format: 'mp3'
    });
    wx.showToast({ title: '开始录音', icon: 'none' });
  },

  stopRecord() {
    if (!this.data.recordingLineId) {
      return;
    }
    this.recorderManager.stop();
  },

  async uploadLineAudio(lineId, filePath) {
    wx.showLoading({ title: '上传识别中...' });
    try {
      const uploadResult = await api.uploadAudioLine({
        userId: this.data.userId,
        videoId: this.data.videoId,
        lineId,
        filePath
      });

      const lines = this.data.lines.map((line) => {
        if (line.line_id === lineId) {
          return {
            ...line,
            spoken_text: uploadResult.transcript || '',
            line_score: uploadResult.line_score,
            audio_uploaded: true
          };
        }
        return line;
      });
      this.setData({ lines });
      wx.showToast({ title: '本句识别完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async submitDubbing() {
    const missing = this.data.lines.filter((line) => !line.spoken_text);
    if (missing.length) {
      wx.showToast({ title: '请先完成每句录音', icon: 'none' });
      return;
    }

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
