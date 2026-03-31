const api = require('../../utils/api');
const { getOrCreateUserId } = require('../../utils/user');
const app = getApp();

const BASE_URL_KEY = 'pk_base_url';

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

Page({
  data: {
    userId: '',
    videos: [],
    loading: false,
    baseUrlInput: '',
    healthStatus: '',
    diagnostics: {
      running: false,
      lastRunAt: '',
      request: { status: 'idle', message: '未检测' },
      upload: { status: 'idle', message: '未检测' },
      download: { status: 'idle', message: '未检测' }
    }
  },

  onLoad() {
    const savedBaseUrl = wx.getStorageSync(BASE_URL_KEY) || app.globalData.baseUrl || '';
    const normalized = normalizeBaseUrl(savedBaseUrl);
    if (normalized) {
      app.globalData.baseUrl = normalized;
    }
    this.setData({ baseUrlInput: normalized });
  },

  onShow() {
    this.setData({ userId: getOrCreateUserId() });
    const normalized = normalizeBaseUrl(this.data.baseUrlInput || wx.getStorageSync(BASE_URL_KEY));
    if (!normalized) {
      return;
    }
    app.globalData.baseUrl = normalized;
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
  },

  onBaseUrlInput(e) {
    this.setData({ baseUrlInput: e.detail.value || '' });
  },

  saveBaseUrl() {
    const normalized = normalizeBaseUrl(this.data.baseUrlInput);
    if (!normalized) {
      wx.showToast({ title: '请输入后端地址', icon: 'none' });
      return;
    }
    app.globalData.baseUrl = normalized;
    wx.setStorageSync(BASE_URL_KEY, normalized);
    wx.showToast({ title: '后端地址已保存', icon: 'success' });
  },

  async testConnection() {
    const normalized = normalizeBaseUrl(this.data.baseUrlInput);
    if (!normalized) {
      wx.showToast({ title: '请先填写后端地址', icon: 'none' });
      return;
    }
    app.globalData.baseUrl = normalized;
    wx.setStorageSync(BASE_URL_KEY, normalized);
    this.setData({ healthStatus: '检测中...' });
    try {
      await new Promise((resolve, reject) => {
        wx.request({
          url: `${normalized}/health`,
          timeout: 8000,
          success: (res) => {
            if (res.statusCode === 200 && res.data && res.data.status === 'ok') {
              resolve(res.data);
              return;
            }
            reject(new Error('健康检查未通过'));
          },
          fail: () => reject(new Error('网络不可达'))
        });
      });
      this.setData({ healthStatus: '连接成功' });
      wx.showToast({ title: '连接成功', icon: 'success' });
      this.fetchVideos();
    } catch (error) {
      this.setData({ healthStatus: '连接失败' });
      wx.showToast({
        title: '连接失败：请检查HTTPS与业务域名',
        icon: 'none'
      });
    }
  },

  formatRunTime() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  setDiagnosticResult(channel, status, message) {
    this.setData({
      [`diagnostics.${channel}.status`]: status,
      [`diagnostics.${channel}.message`]: message
    });
  },

  createDiagnosticFile() {
    const userDataPath = wx.env && wx.env.USER_DATA_PATH;
    if (!userDataPath) {
      return Promise.reject(new Error('当前环境不支持诊断文件写入'));
    }
    const filePath = `${userDataPath}/diag-${Date.now()}.wav`;
    const fs = wx.getFileSystemManager();
    return new Promise((resolve, reject) => {
      fs.writeFile({
        filePath,
        data: 'diagnostic-audio',
        encoding: 'utf8',
        success: () => resolve(filePath),
        fail: (error) => reject(error)
      });
    });
  },

  runRequestDiagnostic(baseUrl) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${baseUrl}/health`,
        timeout: 8000,
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.status === 'ok') {
            resolve('request 已连通');
            return;
          }
          reject(new Error(`request 返回 ${res.statusCode}`));
        },
        fail: (error) => reject(new Error(error.errMsg || 'request 失败'))
      });
    });
  },

  async runUploadDiagnostic(baseUrl) {
    const filePath = await this.createDiagnosticFile();
    const userId = this.data.userId || getOrCreateUserId();
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${baseUrl}/dubbings/audio-lines/upload`,
        filePath,
        name: 'audio_file',
        formData: {
          user_id: userId,
          video_id: 'video_001',
          line_id: 'l1'
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve('uploadFile 已连通');
            return;
          }
          reject(new Error(`uploadFile 返回 ${res.statusCode}`));
        },
        fail: (error) => reject(new Error(error.errMsg || 'uploadFile 失败'))
      });
    });
  },

  runDownloadDiagnostic(baseUrl) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: `${baseUrl}/health`,
        timeout: 8000,
        success: (res) => {
          if (res.statusCode === 200) {
            resolve('downloadFile 已连通');
            return;
          }
          reject(new Error(`downloadFile 返回 ${res.statusCode}`));
        },
        fail: (error) => reject(new Error(error.errMsg || 'downloadFile 失败')),
        complete: (res) => {
          if (res && res.tempFilePath) {
            wx.getFileSystemManager().unlink({
              filePath: res.tempFilePath,
              fail: () => {}
            });
          }
        }
      });
    });
  },

  async runDiagnostics() {
    const baseUrl = normalizeBaseUrl(this.data.baseUrlInput);
    if (!baseUrl) {
      wx.showToast({ title: '请先填写后端地址', icon: 'none' });
      return;
    }
    app.globalData.baseUrl = baseUrl;
    wx.setStorageSync(BASE_URL_KEY, baseUrl);

    this.setData({
      diagnostics: {
        running: true,
        lastRunAt: this.formatRunTime(),
        request: { status: 'pending', message: '检测中...' },
        upload: { status: 'pending', message: '检测中...' },
        download: { status: 'pending', message: '检测中...' }
      }
    });

    try {
      const requestResult = await this.runRequestDiagnostic(baseUrl);
      this.setDiagnosticResult('request', 'success', requestResult);
    } catch (error) {
      this.setDiagnosticResult('request', 'failed', error.message || 'request 失败');
    }

    try {
      const uploadResult = await this.runUploadDiagnostic(baseUrl);
      this.setDiagnosticResult('upload', 'success', uploadResult);
    } catch (error) {
      this.setDiagnosticResult('upload', 'failed', error.message || 'uploadFile 失败');
    }

    try {
      const downloadResult = await this.runDownloadDiagnostic(baseUrl);
      this.setDiagnosticResult('download', 'success', downloadResult);
    } catch (error) {
      this.setDiagnosticResult('download', 'failed', error.message || 'downloadFile 失败');
    }

    this.setData({
      'diagnostics.running': false
    });
  }
});
