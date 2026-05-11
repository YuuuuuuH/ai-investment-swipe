const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

const multer = require('multer');
const fs = require('fs'); // 确保也导入了 fs 模块
const csv = require('csv-parser'); // 确保也导入了 csv-parser
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// ==========================================
// 1. 数据库初始化 (建表与预埋数据)
// ==========================================
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, async (err) => {
  if (err) return console.error('数据库连接失败:', err.message);
  console.log('📅 已连接 SQLite 数据库');
  
  // 初始化表结构
  db.serialize(() => {
    // 项目表
    db.run(`CREATE TABLE IF NOT EXISTS projects (
      project_id TEXT PRIMARY KEY,
      project_name TEXT,
      one_liner TEXT,
      sector TEXT,
      source_agent TEXT,
      team_overview TEXT,
      financing_overview TEXT,
      business_progress TEXT,
      industry_position TEXT,
      ai_score INTEGER,
      ai_score_reason TEXT,
      evidence_urls TEXT,
      latest_info_written_at DATETIME,
      info_version INTEGER DEFAULT 1,
      info_hash TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);

    // 反馈表 (增加唯一索引：同一个经理对同一个版本只能反馈一次)
    db.run(`CREATE TABLE IF NOT EXISTS human_feedback (
      feedback_id TEXT PRIMARY KEY,
      project_id TEXT,
      investor_id TEXT,
      investor_name TEXT,
      info_version INTEGER,
      action TEXT,
      feedback_text TEXT,
      created_at DATETIME,
      UNIQUE(project_id, investor_id, info_version)
    )`);

    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      password TEXT,
      role TEXT
    )`, () => {
      // 预埋 3 个经理和 1 个管理员，如果已存在就不加了。
      const stmt = db.prepare("INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?)");
      stmt.run('inv_001', 'Alice', '123', 'manager');
      stmt.run('inv_002', 'Bob', '123', 'manager');
      stmt.run('inv_003', 'Charlie', '123', 'manager');
      stmt.run('admin', '系统管理员', 'admin', 'admin');
      stmt.finalize();
    });
  });
});

// ==========================================
// 2. 核心业务：推荐流 (GET /api/feed)
// ==========================================
app.get('/api/feed', (req, res) => {
  const { investor_id, limit = 20 } = req.query;
  if (!investor_id) return res.status(400).json({ error: '必须提供 investor_id' });

  // 逻辑：过滤掉该经理已反馈过当前版本的项目
  const sql = `
    SELECT p.* FROM projects p
    WHERE NOT EXISTS (
      SELECT 1 FROM human_feedback f
      WHERE f.project_id = p.project_id
        AND f.investor_id = ?
        AND f.info_version = p.info_version
    )
    ORDER BY p.ai_score DESC, p.latest_info_written_at DESC
    LIMIT ?
  `;

  db.all(sql, [investor_id, limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows || [] });
  });
});

// ==========================================
// 3. 用户认证 (POST /api/login)
// ==========================================
app.post('/api/login', (req, res) => {
  const { user_id, password } = req.body;
  db.get("SELECT * FROM users WHERE user_id = ? AND password = ?", [user_id, password], (err, user) => {
    if (err) return res.status(500).json({ success: false });
    if (user) {
      res.json({ success: true, data: { investor_id: user.user_id, investor_name: user.name, role: user.role } });
    } else {
      res.status(401).json({ success: false, message: '账号或密码错误' });
    }
  });
});

// ==========================================
// 4. 滑动反馈 (POST /api/feedback)
// ==========================================
app.post('/api/feedback', (req, res) => {
  const { investor_id, project_id, info_version, action, feedback_text } = req.body;
  
  // 先获取经理名字
  db.get("SELECT name FROM users WHERE user_id = ?", [investor_id], (err, user) => {
    const investor_name = user ? user.name : investor_id;
    const feedback_id = `fb_${Date.now()}`;
    const created_at = new Date().toISOString();

    const sql = `INSERT INTO human_feedback VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [feedback_id, project_id, investor_id, investor_name, info_version, action, feedback_text, created_at], function(err) {
      if (err) return res.status(500).json({ error: '保存失败或已反馈过该版本' });
      res.json({ success: true });
    });
  });
});

// ==========================================
// 5. 管理员：进度统计 (GET /api/admin/stats)
// ==========================================
app.get('/api/admin/stats', (req, res) => {
  // 计算每个经理对“当前所有项目最新版本”的处理进度
  const sql = `
    SELECT 
      u.user_id, u.name as user_name,
      (SELECT COUNT(*) FROM projects) as total_count,
      (SELECT COUNT(*) FROM human_feedback f 
       WHERE f.investor_id = u.user_id 
       AND f.info_version = (SELECT p.info_version FROM projects p WHERE p.project_id = f.project_id)) as processed_count
    FROM users u WHERE u.role = 'manager'
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// ==========================================
// 7. 看板记录 (GET /api/history)
// ==========================================
app.get('/api/history', (req, res) => {
  const { investor_id, filter_action, is_global } = req.query;
  let sql = `
    SELECT f.*, p.project_name, p.sector, p.ai_score, p.one_liner 
    FROM human_feedback f 
    JOIN projects p ON f.project_id = p.project_id 
    WHERE 1=1
  `;
  const params = [];

  if (is_global !== 'true') {
    sql += " AND f.investor_id = ? ";
    params.push(investor_id);
  }

  if (filter_action && filter_action !== 'all') {
    sql += " AND f.action = ? ";
    params.push(filter_action);
  }

  sql += " ORDER BY f.created_at DESC";
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows || [] });
  });
});

// 获取项目详情反馈（首页背面调用）
app.get('/api/project/feedback/current', (req, res) => {
  const { project_id, info_version } = req.query;
  const sql = `SELECT * FROM human_feedback WHERE project_id = ? AND info_version = ? ORDER BY created_at DESC`;
  db.all(sql, [project_id, info_version], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows || [] });
  });
});

async function processCSV(filePath, db) {
  const rows = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv({
        mapHeaders: ({ header }) => header.replace(/^\ufeff/ig, '').replace(/['"]+/g, '').trim()
      }))
      .on('data', (row) => rows.push(row))
      .on('end', async () => {
        let insertCount = 0, updateCount = 0;
        for (const row of rows) {
          // ... 这里放你之前的 db.get 和 db.run 逻辑 ...
          // 注意：此处代码逻辑同你提供的 import_data.js
        }
        resolve({ insertCount, updateCount, total: rows.length });
      })
      .on('error', reject);
  });
}

// ✅ 完整的上传接口实现
app.post('/api/admin/upload-csv', upload.single('file'), async (req, res) => {
  console.log("📥 收到手动上传请求");
  
  if (!req.file) {
    return res.status(400).json({ error: '没有接收到文件' });
  }

  const filePath = req.file.path;
  const rows = [];

  // 复用你之前的解析逻辑
  fs.createReadStream(filePath)
    .pipe(csv({
      mapHeaders: ({ header }) => header.replace(/^\ufeff/ig, '').replace(/['"]+/g, '').trim()
    }))
    .on('data', (data) => rows.push(data))
    .on('end', async () => {
      let insertCount = 0;
      let updateCount = 0;

      // 串行处理数据库逻辑
      for (const row of rows) {
        await new Promise((resolve) => {
          db.get('SELECT info_version, info_hash FROM projects WHERE project_id = ?', [row.project_id], (err, existing) => {
            if (existing) {
              if (existing.info_hash !== row.info_hash) {
                db.run(`UPDATE projects SET info_version = ?, info_hash = ?, updated_at = ? WHERE project_id = ?`, 
                [existing.info_version + 1, row.info_hash, new Date().toISOString(), row.project_id], () => {
                  updateCount++;
                  resolve();
                });
              } else { resolve(); }
            } else {
              const insertSql = `INSERT INTO projects (project_id, project_name, one_liner, sector, source_agent, team_overview, financing_overview, business_progress, industry_position, ai_score, ai_score_reason, evidence_urls, latest_info_written_at, info_version, info_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
              db.run(insertSql, [row.project_id, row.project_name, row.one_liner, row.sector, row.source_agent, row.team_overview, row.financing_overview, row.business_progress, row.industry_position, parseInt(row.ai_score)||0, row.ai_score_reason, row.evidence_urls, row.latest_info_written_at, 1, row.info_hash, new Date().toISOString(), new Date().toISOString()], () => {
                insertCount++;
                resolve();
              });
            }
          });
        });
      }

      // 清理临时文件
      fs.unlinkSync(filePath);
      
      res.json({ success: true, insertCount, updateCount });
    })
    .on('error', (err) => {
      res.status(500).json({ success: false, error: err.message });
    });
});

app.get('/api/project/feedback/all', (req, res) => {
  const { project_id } = req.query;
  const sql = `
    SELECT f.*, p.project_name FROM human_feedback f
    JOIN projects p ON f.project_id = p.project_id
    WHERE f.project_id = ? ORDER BY f.created_at DESC
  `;
  db.all(sql, [project_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows || [] });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SentinelFlow Backend Running on http://localhost:${PORT}`);
});