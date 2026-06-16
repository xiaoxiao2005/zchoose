/**
 * 按手机号清除用户及其关联数据，便于该手机号重新注册。
 * 用法：cd backend && npx tsx scripts/delete-user-by-phone.ts 17308112541
 */
import 'dotenv/config';
import { initDb, db, saveDb } from '../src/db/init';

const phone = process.argv[2]?.trim();
if (!phone) {
  console.error('用法: npx tsx scripts/delete-user-by-phone.ts <手机号>');
  process.exit(1);
}

async function main() {
  await initDb();

  const user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as { id: number } | undefined;
  if (!user) {
    console.log(`未找到手机号 ${phone} 对应用户，无需删除。`);
    return;
  }

  const userId = user.id;
  const tables: [string, string][] = [
    ['body_profiles', 'user_id'],
    ['user_points', 'user_id'],
    ['user_unlocks', 'user_id'],
    ['tryon_results', 'user_id'],
    ['outfit_records', 'user_id'],
    ['user_submissions', 'user_id'],
    ['support_messages', 'user_id'],
    ['douyin_claims', 'user_id'],
  ];

  for (const [table, col] of tables) {
    try {
      db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(userId);
    } catch (e) {
      console.warn(`删除 ${table} 时:`, e);
    }
  }

  db.prepare('DELETE FROM verification_codes WHERE target = ? AND type = ?').run(phone, 'phone');
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  saveDb();
  console.log(`已清除用户 ${phone} (id=${userId}) 及其关联数据，该手机号可重新注册。`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
