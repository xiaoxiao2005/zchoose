import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { initDb, db, saveDb } from '../src/db/init';
import { analyzeOutfitImage, sanitizeStyleTagsString } from '../src/services/outfitImageTagger';

type OutfitRow = {
  id: number;
  name: string;
  image_url: string | null;
  style_tags: string | null;
};

function mergeTags(origin: string | null | undefined, generated: string[]): string {
  const parts = [
    ...(origin || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...generated,
  ];
  return sanitizeStyleTagsString(parts.join(','));
}

function resolveImagePath(imageUrl: string): string {
  const rel = imageUrl.replace(/^\/+/, '');
  return path.resolve(__dirname, '../../frontend/public', rel);
}

async function main() {
  await initDb();

  const rawArgs = process.argv.slice(2);
  const npmArgv = String(process.env.npm_config_argv || '');
  const mergedArgText = `${rawArgs.join(' ')} ${npmArgv}`.trim();
  const dryRun = /(^|\s)--dry-run(\s|$)/.test(mergedArgText) || /(^|\s)--preview(\s|$)/.test(mergedArgText);

  let limit = 0;
  const limitArg = rawArgs.find((arg) => arg.startsWith('--limit=')) || rawArgs.find((arg) => arg.startsWith('--max='));
  if (limitArg) {
    limit = Number(limitArg.split('=')[1]);
  } else {
    const match = mergedArgText.match(/--(?:limit|max)=(\d+)/);
    if (match?.[1]) limit = Number(match[1]);
  }

  const rows = db.prepare('SELECT id, name, image_url, style_tags FROM outfits ORDER BY id').all() as OutfitRow[];
  const targets = Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows;

  let processed = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of targets) {
    processed += 1;
    if (!row.image_url || !row.image_url.startsWith('/images/')) {
      skipped += 1;
      continue;
    }

    const imageAbs = resolveImagePath(row.image_url);
    if (!fs.existsSync(imageAbs)) {
      skipped += 1;
      continue;
    }

    try {
      const analysis = await analyzeOutfitImage(imageAbs, row.name || path.basename(imageAbs));
      const nextTags = mergeTags(row.style_tags, analysis.tags);
      if (nextTags === (row.style_tags || '')) continue;

      if (!dryRun) {
        db.prepare('UPDATE outfits SET style_tags = ? WHERE id = ?').run(nextTags, row.id);
      }
      updated += 1;
      console.log(
        `[${dryRun ? 'DRY' : 'OK'}] outfit=${row.id} tags+=${analysis.tags.join('|')} hsv=(${analysis.metrics.avgHue},${analysis.metrics.avgSat},${analysis.metrics.avgLight})`
      );
    } catch (err) {
      skipped += 1;
      console.warn(`[SKIP] outfit=${row.id} image=${row.image_url}`, err);
    }
  }

  if (!dryRun) saveDb();
  console.log(
    `${dryRun ? '预览完成' : '打标完成'}：processed=${processed}, updated=${updated}, skipped=${skipped}, dryRun=${dryRun}`
  );
}

main().catch((err) => {
  console.error('自动打标失败：', err);
  process.exit(1);
});

