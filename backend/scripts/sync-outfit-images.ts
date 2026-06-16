/**
 * 将 public/images 下各分类目录中的图片同步到衣库数据库。
 * 用法：在 backend 目录执行 npx ts-node -r tsconfig-paths/register scripts/sync-outfit-images.ts
 */
import 'dotenv/config';
import { initDb, saveDb } from '../src/db/init';

async function main() {
  await initDb();
  saveDb();
  console.log('衣库图片已同步到数据库。若后端正在运行，请重启以使 API 使用最新数据。');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
