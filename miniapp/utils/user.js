const KEY = 'pk_user_id';

function getOrCreateUserId() {
  let userId = wx.getStorageSync(KEY);
  if (userId) {
    return userId;
  }

  const randomPart = Math.random().toString(36).slice(2, 10);
  userId = `u_${Date.now()}_${randomPart}`;
  wx.setStorageSync(KEY, userId);
  return userId;
}

module.exports = {
  getOrCreateUserId
};
