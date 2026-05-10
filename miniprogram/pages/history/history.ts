Page({
  data: {
    // 1. 列表与过滤
    currentFilter: 'all',
    filterOptions: [
      { label: '全部', value: 'all' },
      { label: 'Follow', value: 'follow' },
      { label: 'Pass', value: 'pass' },
      { label: 'Covered', value: 'covered' }
    ],
    groupedLogs: [] as any[],
    isAdminMode: false,
    isLoading: false,

    // 2. 详情弹窗与全员时间轴
    showModal: false,
    showVersionList: false, // 切换 详情/时间轴
    selectedProject: null as any,
    versionHistory: [] as any[] // 存储全员反馈流
  },

  onLoad(options: any) {
    // 如果跳转链接是 /pages/history/history?mode=admin
    if (options.mode === 'admin') {
      this.setData({ isAdminMode: true });
      wx.setNavigationBarTitle({ title: '全局决策看板' });
    } else {
      wx.setNavigationBarTitle({ title: '我的决策账单' });
    }
  },

  onShow() {
    this.loadHistory();
  },

  // ---------------------------------------------------------
  // 核心：加载“我的决策”账单列表
  // ---------------------------------------------------------
  onFilterSelect(e: any) {
    if (this.data.isLoading) return;
    const val = e.currentTarget.dataset.value;
    if (this.data.currentFilter === val) return;

    this.setData({ currentFilter: val }, () => {
      this.loadHistory();
    });
  },

// ---------------------------------------------------------
  // 核心：请求逻辑 (适配个人/管理员双模式)
  // ---------------------------------------------------------
  loadHistory() {
    const role = wx.getStorageSync('userRole');
    const investorId = wx.getStorageSync('currentInvestorId');
    
    // 权限安全检查
    if (!investorId) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    this.setData({ isLoading: true });
    wx.showLoading({ title: '同步数据...', mask: true });

    // 动态构建请求参数
    const requestParams: any = {
      filter_action: this.data.currentFilter
    };

    // 🚑 逻辑分流
    if (this.data.isAdminMode && role === 'admin') {
      // 管理员模式：不传特定的 investor_id，或者传一个标记告诉后端“我要看全部”
      requestParams.is_global = true; 
    } else {
      // 经理模式：只传自己的 ID
      requestParams.investor_id = investorId;
    }

    wx.request({
      url: 'http://127.0.0.1:3000/api/history',
      method: 'GET',
      data: requestParams,
      timeout: 5000,
      success: (res: any) => {
        if (res.statusCode === 200 && res.data && res.data.data) {
          // 如果是管理员模式，可能需要对 processData 稍微调整（显示反馈人姓名）
          this.processData(res.data.data);
        } else {
          wx.showToast({ title: '暂无记录', icon: 'none' });
          this.setData({ groupedLogs: [] });
        }
      },
      fail: (err) => {
        console.error('❌ 请求失败:', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
      },
      complete: () => {
        this.setData({ isLoading: false });
        wx.hideLoading();
      }
    });
  },

  // 按日期归档加工
  processData(list: any[]) {
    const groups: { [key: string]: any[] } = {};
    list.forEach(item => {
      const dateObj = item.created_at ? new Date(item.created_at) : new Date();
      if (isNaN(dateObj.getTime())) return;

      const dateStr = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
      const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
      
      if (!groups[dateStr]) groups[dateStr] = [];
      groups[dateStr].push({ ...item, time: timeStr });
    });

    const groupedArray = Object.keys(groups).map(date => ({
      date: date,
      items: groups[date]
    }));
    this.setData({ groupedLogs: groupedArray });
  },

  // ---------------------------------------------------------
  // 核心：全员反馈详情与时间轴逻辑
  // ---------------------------------------------------------

  // 点击账单条目，打开详情
  showProjectDetail(e: any) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedProject: item,
      showModal: true,
      showVersionList: false, // 默认进入详情视图
      versionHistory: []
    });
  },

  // 切换：当前详情 vs 全员时间轴
  toggleVersionView() {
    const targetState = !this.data.showVersionList;
    
    // 如果切换到时间轴且数据为空，则请求全员数据
    if (targetState && this.data.versionHistory.length === 0) {
      this.fetchProjectTimeline();
    }
    
    this.setData({ showVersionList: targetState });
  },

  // 🚀 获取全员、全版本的 Feedback Timeline
  fetchProjectTimeline() {
    const project_id = this.data.selectedProject.project_id;
    
    wx.showLoading({ title: '追溯全员记录...' });
    wx.request({
      url: 'http://127.0.0.1:3000/api/project/feedback/all', // 调用全员接口
      data: { 
        project_id: project_id, 
        current_version_only: false // 看板需要穿透所有版本
      },
      success: (res: any) => {
        if (res.data && res.data.data) {
          const list = res.data.data.map((f: any) => ({
            ...f,
            // 格式化：2026-05-10 14:30
            fmt_date: f.created_at.substring(0, 16).replace('T', ' ')
          }));
          this.setData({ versionHistory: list });
        }
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  hideModal() {
    this.setData({ showModal: false });
  },

  stopBubble() {}, // 阻止弹窗点击穿透

  goBack() {
    wx.navigateBack();
  }
});