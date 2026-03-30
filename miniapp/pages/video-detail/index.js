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
    rendering: false,
    renderedVideoUrl: '',
    recordingLineId: '',
    recorderReady: false
  },

  onLoad(options) {
    this.setData({
      videoId: options.videoId || '',
      userId: getOrCreateUserId()
    });
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
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

  toggleRecord(e) {
    const { lineId } = e.currentTarget.dataset;
    if (this.data.recordingLineId === lineId) {
      this.stopRecord();
      return;
    }
    if (this.data.recordingLineId) {
      wx.showToast({ title: '请先结束当前录音', icon: 'none' });
      return;
    }
    this.startRecord(e);
  },

  startRecord(e) {
    if (!this.data.recorderReady) {
      wx.showToast({ title: '录音器尚未就绪', icon: 'none' });
      return;
    }
    const { lineId } = e.currentTarget.dataset;

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

  async renderVideo() {
    const missing = this.data.lines.filter((line) => !line.audio_uploaded);
    if (missing.length) {
      wx.showToast({ title: '请先完成每句录音上传', icon: 'none' });
      return;
    }

    this.setData({ rendering: true });
    wx.showLoading({ title: '合成中...' });
    try {
      const rendered = await api.renderDubbingVideo({
        user_id: this.data.userId,
        video_id: this.data.videoId
      });
      const downloadUrl = api.buildAbsoluteUrl(rendered.download_url);
      this.setData({ renderedVideoUrl: downloadUrl });
      wx.showToast({ title: '合成完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '合成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ rendering: false });
    }
  },

  async createInvitation() {
    try {
      const invite = await api.createPkInvitation({
        user_id: this.data.userId,
        video_id: this.data.videoId
      });
      this.setData({ invite });
      wx.setClipboardData({ data: invite.share_code });
      wx.showToast({ title: '邀请码已复制，可直接分享', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: error.message || '创建失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const shareCode = this.data.invite.share_code;
    if (!shareCode) {
      return {
        title: `来和我挑战「${this.data.video.title || '配音PK'}」`,
        path: `/pages/video-detail/index?videoId=${this.data.videoId}`
      };
    }
    return {
      title: `来参加我的配音PK：${this.data.video.title || this.data.videoId}`,
      path: `/pages/pk-join/index?shareCode=${shareCode}`
    };
  },

  onShareTimeline() {
    return {
      title: `配音PK挑战：${this.data.video.title || this.data.videoId}`
    };
  },

  goLeaderboard() {
    wx.navigateTo({
      url: `/pages/leaderboard/index?videoId=${this.data.videoId}`
    });
  }
});
