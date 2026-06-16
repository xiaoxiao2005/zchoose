/**
 * 查询衣库中指定标签的搭配数量及首条 image_url（调试用）
 */
import 'dotenv/config';
import { initDb, db } from '../src/db/init';

async function main() {
  await initDb();
  const rows = db.prepare(
    "SELECT id, name, image_url, style_tags FROM outfits WHERE style_tags = ?"
  ).all('日常,夏,男,青年') as { id: number; name: string; image_url: string | null; style_tags: string }[];
  console.log('日常,夏,男,青年 记录数:', rows.length);
  if (rows.length > 0) {
    console.log('首条 name:', rows[0].name);
    console.log('首条 image_url:', rows[0].image_url);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
