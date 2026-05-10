const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('开始初始化数据库');

  // 1. 构造项目表
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
    latest_info_written_at TEXT,
    info_version INTEGER,
    info_hash TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);

  // 2. 构造反馈表
  db.run(`CREATE TABLE IF NOT EXISTS human_feedback (
    feedback_id TEXT PRIMARY KEY,
    project_id TEXT,
    investor_id TEXT,
    investor_name TEXT,
    info_version INTEGER,
    action TEXT,
    feedback_text TEXT,
    created_at TEXT,
    UNIQUE(project_id, investor_id, info_version)
  )`, (err) => {
    if (err) {
      console.error('构建失败:', err.message);
    } else {
      console.log('构建完成');
    }
  });

  db.run(`CREATE TABLE users (user_id TEXT PRIMARY KEY, name TEXT, password TEXT, role TEXT)`);

  // 初始化账号
  const stmt = db.prepare("INSERT INTO users VALUES (?, ?, ?, ?)");
  stmt.run('inv_001', 'Alice', '123', 'manager');
  stmt.run('inv_002', 'Bob', '123', 'manager');
  stmt.run('admin', '系统管理员', 'admin', 'admin');
  stmt.finalize();
  
});

db.close();