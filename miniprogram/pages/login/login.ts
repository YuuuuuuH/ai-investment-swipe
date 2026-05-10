Page({
  data: {
    userId: '',
    password: ''
  },

  inputID(e: any) { this.setData({ userId: e.detail.value }); },
  inputPwd(e: any) { this.setData({ password: e.detail.value }); },

  handleLogin() {
    const { userId, password } = this.data;
    if (!userId || !password) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '安全校验中...', mask: true });

    wx.request({
      url: 'http://127.0.0.1:3000/api/login',
      method: 'POST',
      data: { user_id: userId, password: password },
      success: (res: any) => {
        if (res.statusCode === 200 && res.data.success) {
          const userInfo = res.data.data;
          
          // ✅ 核心：持久化存储身份标签
          wx.setStorageSync('currentInvestorId', userInfo.investor_id);
          wx.setStorageSync('currentInvestorName', userInfo.investor_name);
          wx.setStorageSync('userRole', userInfo.role);

          wx.showToast({ title: '校验通过', icon: 'success' });
          
          // ✅ 角色跳转逻辑
          setTimeout(() => {
            if (userInfo.role === 'admin') {
              wx.reLaunch({ url: '/pages/admin/dashboard' });
            } else {
              wx.reLaunch({ url: '/pages/index/index' });
            }
          }, 800);
        } else {
          wx.showToast({ title: '认证失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '连接服务器失败', icon: 'none' });
      },
      complete: () => wx.hideLoading()
    });
  }
});