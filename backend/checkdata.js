const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 指向你的数据库文件
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('--- 🔍 正在读取数据库信息 ---\n');

db.serialize(() => {
  // 1. 查看项目表（看 project_id 是否正常）
  db.all('SELECT project_id, project_name, info_version FROM projects LIMIT 50', [], (err, rows) => {
    if (err) {
      console.error('读取 projects 表失败:', err.message);
      return;
    }
    console.log('📍 项目表预览 (前5条):');
    console.table(rows); // 使用 console.table 可以像表格一样整齐地显示数据
  });

  // 2. 查看反馈表（看你刚才滑动的记录是否存入）
  db.all('SELECT * FROM human_feedback ORDER BY created_at DESC LIMIT 10', [], (err, rows) => {
    if (err) {
      console.error('读取 human_feedback 表失败:', err.message);
      return;
    }
    console.log('\n📊 最近的滑动反馈记录 (前10条):');
    if (rows.length === 0) {
      console.log('(目前还没有反馈记录)');
    } else {
      console.table(rows);
    }
  });
});

db.close();