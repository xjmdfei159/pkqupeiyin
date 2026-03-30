const app = getApp();

function request({ url, method = 'GET', data }) {
  const baseUrl = (app && app.globalData && app.globalData.baseUrl) || '';
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: {
        'content-type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        reject(new Error(res.data && res.data.detail ? res.data.detail : '请求失败'));
      },
      fail: (err) => reject(err)
    });
  });
}

function getVideos() {
  return request({ url: '/videos' });
}

function getVideo(videoId) {
  return request({ url: `/videos/${videoId}` });
}

function getLeaderboard(videoId, limit = 20) {
  return request({ url: `/videos/${videoId}/leaderboard?limit=${limit}` });
}

function submitDubbing(payload) {
  return request({
    url: '/dubbings/submit',
    method: 'POST',
    data: payload
  });
}

function createPkInvitation(payload) {
  return request({
    url: '/pk/invitations',
    method: 'POST',
    data: payload
  });
}

function joinPkInvitation(shareCode, payload) {
  return request({
    url: `/pk/invitations/${shareCode}/join`,
    method: 'POST',
    data: payload
  });
}

module.exports = {
  getVideos,
  getVideo,
  getLeaderboard,
  submitDubbing,
  createPkInvitation,
  joinPkInvitation
};
