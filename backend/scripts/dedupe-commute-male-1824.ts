/**
 * 职场通勤-男-18-24：同一 image_url 只保留 id 最小的一条，删除其余重复行
 */
import 'dotenv/config';
import { initDb, saveDb, db } from '../src/db/init';

async function main() {
  await initDb();
  const rows = db
    .prepare("SELECT id, name, image_url FROM outfits WHERE name LIKE '职场通勤-男-18-24-%' ORDER BY id")
    .all() as { id: number; name: string; image_url: string }[];

  const byUrl = new Map<string, { id: number; name: string }[]>();
  for (const r of rows) {
    const key = r.image_url || '';
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key)!.push({ id: r.id, name: r.name });
  }

  const toDelete: number[] = [];
  for (const [, list] of byUrl) {
    if (list.length <= 1) continue;
    list.sort((a, b) => a.id - b.id);
    for (let i = 1; i < list.length; i++) toDelete.push(list[i].id);
  }

  for (const id of toDelete) {
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
    console.log('已删除重复 id=', id);
  }

  saveDb();
  console.log('完成，共删除', toDelete.length, '条重复记录');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
