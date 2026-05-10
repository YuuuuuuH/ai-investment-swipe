const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.resolve(__dirname, 'database.sqlite');
const csvPath = path.resolve(__dirname, '../data/demo_projects_20.csv');
const db = new sqlite3.Database(dbPath);

async function runImport() {
  console.log('--- 🚀 开始清理并灌入数据 ---');

  const rows = [];

  // 1. 流式读取并清洗数据
  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv({
        // 彻底解决 BOM 和 引号问题的终极 mapHeaders
        mapHeaders: ({ header }) => {
          const clean = header.replace(/^\ufeff/ig, '').replace(/['"]+/g, '').trim();
          // 强制纠正第一列，如果长得像 project_id 就固定给它
          if (clean.includes('project_id')) return 'project_id';
          return clean;
        }
      }))
      .on('data', (row) => {
        // 清洗每一行的数据，剔除多余引号和空格
        const cleanRow = {};
        for (let key in row) {
          const cleanKey = key.trim();
          let value = row[key] ? row[key].replace(/^['"]+|['"]+$/g, '').trim() : '';
          cleanRow[cleanKey] = value;
        }
        
        // 只有当 project_id 存在且不是 "null" 字符串时才加入列表
        if (cleanRow.project_id && cleanRow.project_id !== 'null' && cleanRow.project_id !== '') {
          rows.push(cleanRow);
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`读取完毕，准备处理 ${rows.length} 条有效记录...`);

  let insertCount = 0;
  let updateCount = 0;

  // 2. 串行处理每一行，确保版本逻辑正确
  for (const row of rows) {
    await new Promise((resolve) => {
      db.get('SELECT info_version, info_hash FROM projects WHERE project_id = ?', [row.project_id], (err, existing) => {
        if (existing) {
          // 如果 hash 变了，说明有新内容，版本号 +1
          if (existing.info_hash !== row.info_hash) {
            const updateSql = `UPDATE projects SET info_version = ?, info_hash = ?, updated_at = ? WHERE project_id = ?`;
            db.run(updateSql, [existing.info_version + 1, row.info_hash, new Date().toISOString(), row.project_id], () => {
              updateCount++;
              resolve();
            });
          } else {
            resolve(); // 没变，直接跳过
          }
        } else {
          // 全新项目插入
          const insertSql = `
            INSERT INTO projects (
              project_id, project_name, one_liner, sector, source_agent, team_overview, 
              financing_overview, business_progress, industry_position, ai_score, 
              ai_score_reason, evidence_urls, latest_info_written_at, info_version, 
              info_hash, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          const values = [
            row.project_id, row.project_name, row.one_liner, row.sector, row.source_agent,
            row.team_overview, row.financing_overview, row.business_progress, row.industry_position,
            parseInt(row.ai_score) || 0, row.ai_score_reason, row.evidence_urls, row.latest_info_written_at,
            1, row.info_hash, row.created_at || new Date().toISOString(), row.updated_at || new Date().toISOString()
          ];
          db.run(insertSql, values, (err) => {
            if (!err) insertCount++;
            else console.error(`插入失败 [${row.project_id}]:`, err.message);
            resolve();
          });
        }
      });
    });
  }

  console.log(`\n✅ 处理完成！\n📊 统计: 新增 ${insertCount} 条 | 更新 ${updateCount} 条 | 总计有效数据 ${rows.length} 条`);
  db.close();
}

runImport().catch(console.error);