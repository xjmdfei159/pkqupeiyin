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

function uploadAudioLine({ userId, videoId, lineId, filePath }) {
  const baseUrl = (app && app.globalData && app.globalData.baseUrl) || '';
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${baseUrl}/dubbings/audio-lines/upload`,
      filePath,
      name: 'audio_file',
      formData: {
        user_id: userId,
        video_id: videoId,
        line_id: lineId
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data));
          } catch (error) {
            reject(new Error('上传成功但返回解析失败'));
          }
          return;
        }

        try {
          const payload = JSON.parse(res.data);
          reject(new Error(payload.detail || '上传失败'));
        } catch (error) {
          reject(new Error('上传失败'));
        }
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

function getPkInvitation(shareCode) {
  return request({
    url: `/pk/invitations/${shareCode}`
  });
}

module.exports = {
  getVideos,
  getVideo,
  getLeaderboard,
  submitDubbing,
  uploadAudioLine,
  createPkInvitation,
  getPkInvitation,
  joinPkInvitation
};
