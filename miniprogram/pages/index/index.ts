Page({
  data: {
    projects: [] as any[],
    currentInvestorId: '',
    currentOpinion: '',
    otherFeedbacks: [] as any[] // 存放当前卡片背面的同行评价
  },

  onLoad() {
    const id = wx.getStorageSync('currentInvestorId');
    if (!id) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ currentInvestorId: id });
    this.fetchProjects();
  },

  // ---------------------------------------------------------
  // 1. 数据拉取
  // ---------------------------------------------------------
  fetchProjects() {
    wx.showLoading({ title: '加载中...', mask: true });
    wx.request({
      url: 'http://127.0.0.1:3000/api/feed',
      method: 'GET',
      data: { investor_id: this.data.currentInvestorId, limit: 20 },
      success: (res: any) => {
        wx.hideLoading();
        if (res.data && res.data.data) {
          // 💡 重点：给每个项目初始化 isFlipped 状态
          const list = res.data.data
            .filter((p: any) => p.project_id)
            .map((p: any) => ({ ...p, isFlipped: false }));
          this.setData({ projects: list });
        }
      }
    });
  },

  // ---------------------------------------------------------
  // 2. 翻转逻辑与同行评价获取
  // ---------------------------------------------------------
// pages/index/index.ts
toggleFlip(e: any) {
  const index = e.currentTarget.dataset.index;
  if (index != 0) return;

  const project = this.data.projects[0];
  const nextState = !project.isFlipped;

  // 1. 先翻转 UI，保证反馈立刻发生
  this.setData({
    'projects[0].isFlipped': nextState
  });

  // 2. 只有在翻向背面，且没有数据时才去请求
  if (nextState && this.data.otherFeedbacks.length === 0) {
    this.fetchOthersFeedback(project.project_id, project.info_version);
  }
},

fetchOthersFeedback(projectId: string, version: number) {
  wx.request({
    url: 'http://127.0.0.1:3000/api/project/feedback/current',
    data: { project_id: projectId, info_version: version },
    timeout: 3000, 
    success: (res: any) => {
      if (res.statusCode === 200) {
        const list = (res.data.data || []).map((f: any) => {
          
          const isMe = f.investor_id === this.data.currentInvestorId;

          let anonName = isMe ? '我' : `成员 ${f.investor_id.slice(-3)}`;

          return {
            ...f,
            investor_name: anonName, 
            created_at_fmt: f.created_at.substring(5, 16).replace('T', ' ')
          };
        });
        this.setData({ otherFeedbacks: list });
      }
    },
    fail: () => {
      this.setData({ otherFeedbacks: [] });
    }
  });
},

  // ---------------------------------------------------------
  // 3. 滑动提交与状态重置
  // ---------------------------------------------------------
  onCardSwipe(event: any) {
    let action = 'pass'; 
    if (typeof event === 'string') action = event;
    else if (event?.action) action = event.action;
    else if (event?.detail?.action) action = event.detail.action;

    if (this.data.projects.length === 0) return;
    const swipedProject = this.data.projects[0];

    // 提交反馈
    wx.request({
      url: 'http://127.0.0.1:3000/api/feedback',
      method: 'POST',
      data: {
        investor_id: this.data.currentInvestorId,
        project_id: swipedProject.project_id,
        info_version: swipedProject.info_version,
        action: action,
        feedback_text: this.data.currentOpinion
      }
    });

    // 移除卡片并重置备注和背面的评价
    setTimeout(() => {
      const currentProjects = this.data.projects;
      currentProjects.shift();
      this.setData({ 
        projects: currentProjects,
        currentOpinion: '',
        otherFeedbacks: [] // 💡 划走后清空评价，防止下一张卡片背面残留上一张的内容
      });
      
      if (currentProjects.length === 0) {
        wx.showToast({ title: '今日项目已刷完', icon: 'none' });
      }
    }, 300);
  },

  // ---------------------------------------------------------
  // 工具函数
  // ---------------------------------------------------------
  onOpinionInput(e: any) {
    this.setData({ currentOpinion: e.detail.value });
  },
  goToHistory() { wx.navigateTo({ url: '/pages/history/history' }); },
  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: '/pages/login/login' });
  },
  stopBubble() {} // 阻止点击背面列表时触发翻转回正面
});