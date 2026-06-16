/**
 * 从数据库中删除「日常,夏,男,青年」对应的衣库记录（图片已从文件夹删除后使用）。
 * 用法：在 backend 目录执行 npm run delete-outfit-by-tags
 */
import 'dotenv/config';
import { initDb, saveDb, db } from '../src/db/init';

const TAG = '日常,夏,男,青年';

async function main() {
  await initDb();
  const result = db.prepare('DELETE FROM outfits WHERE style_tags = ?').run(TAG);
  saveDb();
  console.log(`已从衣库中删除「${TAG}」的 ${result.changes ?? 0} 条记录。`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
