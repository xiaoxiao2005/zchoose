import 'dotenv/config';
import { initDb, db, saveDb } from '../src/db/init';
import { sanitizeStyleTagsString } from '../src/services/outfitImageTagger';

type OutfitRow = {
  id: number;
  style_tags: string | null;
};

function sanitizeTags(raw: string | null): string {
  return sanitizeStyleTagsString(raw);
}

async function main() {
  await initDb();

  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--preview');
  const rows = db.prepare('SELECT id, style_tags FROM outfits ORDER BY id').all() as OutfitRow[];

  let changed = 0;
  for (const row of rows) {
    const before = (row.style_tags || '').trim();
    const after = sanitizeTags(row.style_tags);
    if (before === after) continue;
    changed += 1;
    if (!dryRun) {
      db.prepare('UPDATE outfits SET style_tags = ? WHERE id = ?').run(after, row.id);
    }
    console.log(`[${dryRun ? 'DRY' : 'OK'}] outfit=${row.id} tags: "${before}" -> "${after}"`);
  }

  if (!dryRun) saveDb();
  console.log(`${dryRun ? '预览完成' : '清洗完成'}：total=${rows.length}, changed=${changed}, dryRun=${dryRun}`);
}

main().catch((err) => {
  console.error('标签清洗失败：', err);
  process.exit(1);
});

