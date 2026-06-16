/**
 * 按 name 删除一套搭配及相关子表记录（调试用）
 * 用法：npx tsx scripts/delete-outfit-by-name.ts "职场通勤-男-18-24-5"
 */
import 'dotenv/config';
import { initDb, saveDb, db } from '../src/db/init';

const name = process.argv[2];
if (!name) {
  console.error('用法: npx tsx scripts/delete-outfit-by-name.ts <outfit_name>');
  process.exit(1);
}

async function main() {
  await initDb();
  const row = db.prepare('SELECT id FROM outfits WHERE name = ?').get(name) as { id: number } | undefined;
  if (!row) {
    console.log('未找到:', name);
    process.exit(0);
  }
  const id = row.id;
  const tables = [
    'DELETE FROM outfit_merchant_slots WHERE outfit_id = ?',
    'DELETE FROM user_outfit_likes WHERE outfit_id = ?',
    'DELETE FROM user_unlocks WHERE outfit_id = ?',
  ];
  for (const sql of tables) {
    try {
      db.prepare(sql).run(id);
    } catch (_) {
      /* 表可能不存在或无列 */
    }
  }
  try {
    db.prepare('DELETE FROM user_tryon_history WHERE outfit_id = ?').run(id);
  } catch (_) {
    /* 忽略 */
  }
  db.prepare('DELETE FROM outfits WHERE id = ?').run(id);
  saveDb();
  console.log('已删除:', name, 'id=', id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
