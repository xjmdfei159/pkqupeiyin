const BASE_URL_KEY = 'pk_base_url';
const DEFAULT_BASE_URL = '';

App({
  globalData: {
    baseUrl: DEFAULT_BASE_URL
  },

  onLaunch() {
    const savedBaseUrl = wx.getStorageSync(BASE_URL_KEY);
    if (savedBaseUrl) {
      this.globalData.baseUrl = normalizeBaseUrl(savedBaseUrl);
    }
  }
});

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

module.exports = {
  BASE_URL_KEY,
  normalizeBaseUrl
};
