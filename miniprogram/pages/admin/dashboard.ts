Page({
  data: {
    managerStats: [] as any[]
  },

  onShow() {
    this.fetchStats();
  },

  // 获取经理进度数据
  fetchStats() {
    wx.request({
      url: 'http://127.0.0.1:3000/api/admin/stats',
      success: (res: any) => {
        if (res.data?.data) {
          const stats = res.data.data.map((m: any) => ({
            ...m,
            percent: Math.round((m.processed_count / m.total_count) * 100) || 0
          }));
          this.setData({ managerStats: stats });
        }
      }
    });
  },

  // ✅ 新增：手动选择并上传文件逻辑
  handleChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv'], // 限制后缀
      success: (res) => {
        const file = res.tempFiles[0];
        
        wx.showLoading({ title: '正在解析上传...', mask: true });

        // 使用小程序专门的上传 API
        wx.uploadFile({
          url: 'http://127.0.0.1:3000/api/admin/upload-csv', 
          filePath: file.path,
          name: 'file', // 必须与后端 multer 的 upload.single('file') 保持一致
          success: (uploadRes) => {
            // 注意：uploadFile 返回的是字符串，需要 JSON.parse
            const data = JSON.parse(uploadRes.data);
            if (data.success) {
              wx.showModal({
                title: '导入成功',
                content: `新增: ${data.insertCount} | 更新: ${data.updateCount}`,
                showCancel: false
              });
              this.fetchStats(); // 成功后刷新环形图
            } else {
              wx.showToast({ title: data.error || '解析失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.showToast({ title: '连接服务器失败', icon: 'none' });
          },
          complete: () => wx.hideLoading()
        });
      }
    });
  },

  goToGlobalKanban() {
    wx.navigateTo({ url: '/pages/history/history?mode=admin' });
  }

  
});