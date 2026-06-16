/**
 * 按 name 前缀删除搭配（含子表），用于清理旧编号数据后重新同步
 * 用法: npx tsx scripts/purge-outfits-by-name-prefix.ts "职场通勤-男-18-24-"
 */
import 'dotenv/config';
import { initDb, saveDb, db } from '../src/db/init';

const prefix = process.argv[2];
if (!prefix) {
  console.error('用法: npx tsx scripts/purge-outfits-by-name-prefix.ts <name_prefix>');
  process.exit(1);
}

async function main() {
  await initDb();
  const rows = db.prepare('SELECT id, name FROM outfits WHERE name LIKE ?').all(`${prefix}%`) as { id: number; name: string }[];
  for (const r of rows) {
    const id = r.id;
    try {
      db.prepare('DELETE FROM outfit_merchant_slots WHERE outfit_id = ?').run(id);
    } catch (_) {
      /* ignore */
    }
    try {
      db.prepare('DELETE FROM user_outfit_likes WHERE outfit_id = ?').run(id);
    } catch (_) {
      /* ignore */
    }
    try {
      db.prepare('DELETE FROM user_unlocks WHERE outfit_id = ?').run(id);
    } catch (_) {
      /* ignore */
    }
    db.prepare('DELETE FROM outfits WHERE id = ?').run(id);
    console.log('已删除', r.name);
  }
  saveDb();
  console.log('完成，共删除', rows.length, '条');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
