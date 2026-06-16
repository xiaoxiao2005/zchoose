import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { db } from '../db/init';
import { isUnlocked } from './unlocks';
import { isLiked } from './likes';
import { getImagesDir } from '../imagesPath';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { sanitizeStyleTagsString } from '../services/outfitImageTagger';

export const outfitsRouter = Router();

const COMMUTE_MALE_25_29_DIR_NAME = '职场通勤-男25-29岁';
const COMMUTE_MALE_25_29_REQUIRED_TAGS = ['通勤', '男', '25-29'];
const COMMUTE_MALE_30_35_DIR_NAME = '职场通勤-男-30-25';
const COMMUTE_MALE_30_35_REQUIRED_TAGS = ['通勤', '男', '30-35'];
const FESTIVAL_MALE_18_24_DIR_NAME = '节日家庭-男-18-24';
const FESTIVAL_MALE_18_24_REQUIRED_TAGS = ['过年', '男', '18-24'];
const FESTIVAL_MALE_25_29_DIR_NAME = '节日家庭-男-25-29';
const FESTIVAL_MALE_25_29_REQUIRED_TAGS = ['过年', '男', '25-29'];
const FESTIVAL_MALE_30_35_DIR_NAME = '节日家庭-男-30-35';
const FESTIVAL_MALE_30_35_REQUIRED_TAGS = ['过年', '男', '30-35'];
const DATING_MALE_18_24_DIR_NAME = '约会社交-男-18-24';
const DATING_MALE_18_24_REQUIRED_TAGS = ['约会', '男', '18-24'];
const DATING_MALE_25_29_DIR_NAME = '约会社交-男-25-29';
const DATING_MALE_25_29_REQUIRED_TAGS = ['约会', '男', '25-29'];
const DATING_MALE_30_35_DIR_NAME = '约会社交-男-30-35';
const DATING_MALE_30_35_REQUIRED_TAGS = ['约会', '男', '30-35'];
const SPORT_MALE_25_29_DIR_NAME = '运动出行-男-25-29';
const SPORT_MALE_25_29_REQUIRED_TAGS = ['运动', '男', '25-29'];
const SPORT_FEMALE_25_29_DIR_NAME = '运动出行-女-25-29';
const SPORT_FEMALE_25_29_REQUIRED_TAGS = ['运动', '女', '25-29'];
const DAILY_FEMALE_18_24_DIR_NAME = '日常休闲-女-18-24';
const DAILY_FEMALE_18_24_REQUIRED_TAGS = ['日常', '女', '18-24'];
const DAILY_MALE_18_24_DIR_NAME = '日常休闲-男-18-24';
const DAILY_MALE_18_24_REQUIRED_TAGS = ['日常', '男', '18-24'];
const DAILY_MALE_25_29_DIR_NAME = '日常休闲-男-25-29';
const DAILY_MALE_25_29_REQUIRED_TAGS = ['日常', '男', '25-29'];
const ZODIAC_DIR_NAME = '星座穿搭';
const ZODIAC_FEMALE_18_24_REQUIRED_TAGS = ['约会', '女', '18-24', '星座穿搭'];
const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif)$/i;

function shouldSyncCommuteMale25To29(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return COMMUTE_MALE_25_29_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncCommuteMale30To35(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return COMMUTE_MALE_30_35_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncFestivalMale18To24(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return FESTIVAL_MALE_18_24_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncFestivalMale25To29(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return FESTIVAL_MALE_25_29_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncFestivalMale30To35(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return FESTIVAL_MALE_30_35_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncDatingMale18To24(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return DATING_MALE_18_24_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncDatingMale25To29(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return DATING_MALE_25_29_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncDatingMale30To35(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return DATING_MALE_30_35_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncSportMale25To29(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return SPORT_MALE_25_29_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncSportFemale25To29(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return SPORT_FEMALE_25_29_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncDailyFemale18To24(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return DAILY_FEMALE_18_24_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncDailyMale18To24(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return DAILY_MALE_18_24_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncDailyMale25To29(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return DAILY_MALE_25_29_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function shouldSyncZodiacFemale18To24(tags?: string): boolean {
  if (!tags) return false;
  const selected = tags.split(',').map((t) => t.trim()).filter(Boolean);
  return ZODIAC_FEMALE_18_24_REQUIRED_TAGS.every((tag) => selected.includes(tag));
}

function syncCommuteMale25To29Outfits(): void {
  const dir = path.join(getImagesDir(), COMMUTE_MALE_25_29_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '通勤,男,25-29,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${COMMUTE_MALE_25_29_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `职场通勤-男-25-29-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncCommuteMale30To35Outfits(): void {
  const dir = path.join(getImagesDir(), COMMUTE_MALE_30_35_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '通勤,男,30-35,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${COMMUTE_MALE_30_35_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `职场通勤-男-30-35-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncFestivalMale18To24Outfits(): void {
  const dir = path.join(getImagesDir(), FESTIVAL_MALE_18_24_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '过年,男,18-24,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${FESTIVAL_MALE_18_24_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `节日家庭-男-18-24-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncFestivalMale25To29Outfits(): void {
  const dir = path.join(getImagesDir(), FESTIVAL_MALE_25_29_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '过年,男,25-29,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${FESTIVAL_MALE_25_29_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `节日家庭-男-25-29-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncFestivalMale30To35Outfits(): void {
  const dir = path.join(getImagesDir(), FESTIVAL_MALE_30_35_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '过年,男,30-35,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${FESTIVAL_MALE_30_35_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `节日家庭-男-30-35-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncDatingMale18To24Outfits(): void {
  const dir = path.join(getImagesDir(), DATING_MALE_18_24_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '约会,男,18-24,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${DATING_MALE_18_24_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `约会社交-男-18-24-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncDatingMale25To29Outfits(): void {
  const dir = path.join(getImagesDir(), DATING_MALE_25_29_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '约会,男,25-29,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${DATING_MALE_25_29_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `约会社交-男-25-29-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncDatingMale30To35Outfits(): void {
  const dir = path.join(getImagesDir(), DATING_MALE_30_35_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '约会,男,30-35,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${DATING_MALE_30_35_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `约会社交-男-30-35-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncSportMale25To29Outfits(): void {
  const dir = path.join(getImagesDir(), SPORT_MALE_25_29_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '运动,男,25-29,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${SPORT_MALE_25_29_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `运动出行-男-25-29-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncSportFemale25To29Outfits(): void {
  const dir = path.join(getImagesDir(), SPORT_FEMALE_25_29_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '运动,女,25-29,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${SPORT_FEMALE_25_29_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `运动出行-女-25-29-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }
}

function syncDailyFemale18To24Outfits(): void {
  const dir = path.join(getImagesDir(), DAILY_FEMALE_18_24_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    // 目录中标记为“错误”的图不入库，避免前端出现无图占位
    .filter((entry) => !entry.name.includes('错误'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  // 覆盖四季，避免因“当前季节过滤”导致目录图看不到。
  const styleTags = '日常,女,18-24,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');
  const validImageUrls = new Set<string>();

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${DAILY_FEMALE_18_24_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const stem = fileName.replace(/\.[^.]+$/, '');
    const displayName = `日常休闲-女-18-24-${stem}`;
    validImageUrls.add(imageUrl);
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }

  // 清理历史残留记录（如旧版编号命名或指向已移除文件的占位项）
  const existingRows = db.prepare(
    'SELECT id, image_url FROM outfits WHERE image_url LIKE ?'
  ).all(`/images/${DAILY_FEMALE_18_24_DIR_NAME}/%`) as { id: number; image_url: string | null }[];
  for (const row of existingRows) {
    if (!row.image_url || !validImageUrls.has(row.image_url)) {
      db.prepare('DELETE FROM outfits WHERE id = ?').run(row.id);
    }
  }
}

function syncDailyMale18To24Outfits(): void {
  const dir = path.join(getImagesDir(), DAILY_MALE_18_24_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  // 先清洗历史命名，避免旧数据仍显示“去除图片左侧鞋子”
  db.prepare(
    "UPDATE outfits SET name = REPLACE(name, '去除图片左侧鞋子', '') WHERE name LIKE '日常休闲-男-18-24-%去除图片左侧鞋子%'"
  ).run();
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .filter((entry) => !entry.name.includes('错误'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '日常,男,18-24,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');
  const validImageUrls = new Set<string>();

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${DAILY_MALE_18_24_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const stem = fileName.replace(/\.[^.]+$/, '');
    const cleanedStem = stem
      .replace(/去除图片左侧鞋子/g, '')
      .replace(/[_\-\s]+$/g, '')
      .trim();
    const displayName = `日常休闲-男-18-24-${cleanedStem || stem}`;
    validImageUrls.add(imageUrl);
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }

  const existingRows = db.prepare(
    'SELECT id, image_url FROM outfits WHERE image_url LIKE ?'
  ).all(`/images/${DAILY_MALE_18_24_DIR_NAME}/%`) as { id: number; image_url: string | null }[];
  for (const row of existingRows) {
    if (!row.image_url || !validImageUrls.has(row.image_url)) {
      db.prepare('DELETE FROM outfits WHERE id = ?').run(row.id);
    }
  }
}

function syncDailyMale25To29Outfits(): void {
  const dir = path.join(getImagesDir(), DAILY_MALE_25_29_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .filter((entry) => !entry.name.includes('错误'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '日常,男,25-29,春,夏,秋,冬';
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');
  const validImageUrls = new Set<string>();

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${DAILY_MALE_25_29_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const stem = fileName.replace(/\.[^.]+$/, '');
    const displayName = `日常休闲-男-25-29-${stem}`;
    validImageUrls.add(imageUrl);
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, 0);
  }

  const existingRows = db.prepare(
    'SELECT id, image_url FROM outfits WHERE image_url LIKE ?'
  ).all(`/images/${DAILY_MALE_25_29_DIR_NAME}/%`) as { id: number; image_url: string | null }[];
  for (const row of existingRows) {
    if (!row.image_url || !validImageUrls.has(row.image_url)) {
      db.prepare('DELETE FROM outfits WHERE id = ?').run(row.id);
    }
  }
}

function syncZodiacFemale18To24Outfits(): void {
  const dir = path.join(getImagesDir(), ZODIAC_DIR_NAME);
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (files.length === 0) return;

  const styleTags = '约会,女,18-24,星座穿搭,春,夏,秋,冬';
  const zodiacNeedPoints = 10;
  const insertStmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE outfits SET name = ?, style_tags = ?, need_points = ? WHERE id = ?'
  );
  const existsStmt = db.prepare('SELECT id FROM outfits WHERE image_url = ? LIMIT 1');

  for (let i = 0; i < files.length; i += 1) {
    const fileName = files[i];
    const imageUrl = `/images/${ZODIAC_DIR_NAME}/${encodeURIComponent(fileName)}`;
    const seq = String(i + 1).padStart(2, '0');
    const displayName = `摩羯座女-${seq}`;
    const exists = existsStmt.get(imageUrl) as { id: number } | undefined;
    if (exists) {
      updateStmt.run(displayName, styleTags, zodiacNeedPoints, exists.id);
      continue;
    }
    insertStmt.run(displayName, imageUrl, styleTags, zodiacNeedPoints);
  }
}

// 选择「全部」时不展示的占位搭配（示例搭配1～6 或 一～六、1-日常、2-rc）
function isPlaceholderOutfit(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name === '1-日常' || name === '2-rc') return true;
  // 示例搭配1～6 或 示例搭配一～六
  return /^示例搭配[一二三四五六123456]$/.test(name.trim());
}

// 衣库列表（可选：?tags=日常,通勤；?userId= 时每套返回 unlocked）
outfitsRouter.get('/', (req, res) => {
  const tags = req.query.tags as string | undefined;
  if (shouldSyncCommuteMale25To29(tags)) {
    syncCommuteMale25To29Outfits();
  }
  if (shouldSyncCommuteMale30To35(tags)) {
    syncCommuteMale30To35Outfits();
  }
  if (shouldSyncFestivalMale18To24(tags)) {
    syncFestivalMale18To24Outfits();
  }
  if (shouldSyncFestivalMale25To29(tags)) {
    syncFestivalMale25To29Outfits();
  }
  if (shouldSyncFestivalMale30To35(tags)) {
    syncFestivalMale30To35Outfits();
  }
  if (shouldSyncDatingMale18To24(tags)) {
    syncDatingMale18To24Outfits();
  }
  if (shouldSyncDatingMale25To29(tags)) {
    syncDatingMale25To29Outfits();
  }
  if (shouldSyncDatingMale30To35(tags)) {
    syncDatingMale30To35Outfits();
  }
  if (shouldSyncSportMale25To29(tags)) {
    syncSportMale25To29Outfits();
  }
  if (shouldSyncSportFemale25To29(tags)) {
    syncSportFemale25To29Outfits();
  }
  if (shouldSyncDailyFemale18To24(tags)) {
    syncDailyFemale18To24Outfits();
  }
  if (shouldSyncDailyMale18To24(tags)) {
    syncDailyMale18To24Outfits();
  }
  if (shouldSyncDailyMale25To29(tags)) {
    syncDailyMale25To29Outfits();
  }
  if (shouldSyncZodiacFemale18To24(tags)) {
    syncZodiacFemale18To24Outfits();
  }
  const userId = req.query.userId ? Number(req.query.userId) : null;
  let sql = 'SELECT * FROM outfits ORDER BY id';
  let rows: unknown[];
  if (tags) {
    // 必须同时包含所选标签（AND），例如选 日常+春+女+少年 时只返回带「女」的搭配，不会出现「男」
    const list = tags.split(',').map((t) => `%${t.trim()}%`).filter(Boolean);
    if (list.length) {
      const conditions = list.map(() => "style_tags LIKE ?").join(' AND ');
      sql = `SELECT * FROM outfits WHERE ${conditions} ORDER BY id`;
      rows = db.prepare(sql).all(...list);
    } else {
      rows = db.prepare(sql).all();
    }
  } else {
    rows = db.prepare(sql).all();
  }
  // 当选择全部（无 tags）时，不返回占位搭配
  if (!tags || (tags.split(',').map((t) => t.trim()).filter(Boolean).length === 0)) {
    rows = (rows as { name: string }[]).filter((o) => !isPlaceholderOutfit(o.name));
  }
  if (userId != null) {
    rows = (rows as { id: number }[]).map((o) => ({
      ...o,
      unlocked: isUnlocked(userId, o.id),
      liked: isLiked(userId, o.id),
    }));
  }
  const ids = (rows as { id: number }[]).map((o) => o.id);
  let merchantSlotsByOutfit: Record<number, { slot: string; merchant_id: number; merchant_name?: string; product_url?: string; product_title?: string }[]> = {};
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const slots = db.prepare(
      `SELECT oms.outfit_id, oms.slot, oms.merchant_id, m.name AS merchant_name, oms.product_url, oms.product_title
       FROM outfit_merchant_slots oms
       LEFT JOIN merchants m ON m.id = oms.merchant_id
       WHERE oms.outfit_id IN (${placeholders})`
    ).all(...ids) as { outfit_id: number; slot: string; merchant_id: number; merchant_name: string; product_url: string; product_title: string }[];
    slots.forEach((s) => {
      if (!merchantSlotsByOutfit[s.outfit_id]) merchantSlotsByOutfit[s.outfit_id] = [];
      merchantSlotsByOutfit[s.outfit_id].push({
        slot: s.slot,
        merchant_id: s.merchant_id,
        merchant_name: s.merchant_name,
        product_url: s.product_url,
        product_title: s.product_title,
      });
    });
  }
  rows = (rows as { id: number }[]).map((o) => ({
    ...o,
    merchant_slots: merchantSlotsByOutfit[o.id] || [],
  }));
  res.json(rows);
});

outfitsRouter.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const row = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: '搭配不存在' });
  if (userId != null) {
    (row as Record<string, unknown>).unlocked = isUnlocked(userId, id);
    (row as Record<string, unknown>).liked = isLiked(userId, id);
  }
  const slots = db.prepare(
    `SELECT oms.slot, oms.merchant_id, m.name AS merchant_name, oms.product_url, oms.product_title
     FROM outfit_merchant_slots oms
     LEFT JOIN merchants m ON m.id = oms.merchant_id
     WHERE oms.outfit_id = ?`
  ).all(id) as { slot: string; merchant_id: number; merchant_name: string; product_url: string; product_title: string }[];
  (row as Record<string, unknown>).merchant_slots = slots.map((s) => ({
    slot: s.slot,
    merchant_id: s.merchant_id,
    merchant_name: s.merchant_name,
    product_url: s.product_url,
    product_title: s.product_title,
  }));
  res.json(row);
});

// 后台：新增一套搭配（后续可加鉴权）
outfitsRouter.post('/', (req, res) => {
  const { name, image_url, style_tags, need_points } = req.body;
  if (!name) return res.status(400).json({ error: '请提供 name' });
  const tagsRaw = style_tags != null && String(style_tags).trim() !== '' ? sanitizeStyleTagsString(String(style_tags)) : null;
  const stmt = db.prepare(
    'INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(name, image_url ?? null, tagsRaw && tagsRaw.length > 0 ? tagsRaw : null, need_points ?? 0);
  const row = db.prepare('SELECT * FROM outfits WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// 后台：更新一套搭配（未传字段保持原值）
outfitsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, image_url, style_tags, need_points } = req.body;
  const cur = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id) as { name: string; image_url: string | null; style_tags: string | null; need_points: number } | undefined;
  if (!cur) return res.status(404).json({ error: '搭配不存在' });
  const n = name !== undefined ? name : cur.name;
  const img = image_url !== undefined ? image_url : cur.image_url;
  const tags =
    style_tags !== undefined
      ? (String(style_tags).trim() === '' ? null : sanitizeStyleTagsString(String(style_tags)))
      : cur.style_tags;
  const pts = need_points !== undefined ? Number(need_points) : cur.need_points;
  db.prepare('UPDATE outfits SET name=?, image_url=?, style_tags=?, need_points=? WHERE id=?').run(n, img, tags, pts, id);
  const updated = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id);
  res.json(updated);
});

// 后台：删除一套搭配
outfitsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM outfits WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: '搭配不存在' });
  db.prepare('DELETE FROM outfits WHERE id = ?').run(id);
  res.status(204).send();
});

const VALID_SLOTS = ['上衣', '裤子', '鞋子', '配饰'];

function isMerchantUser(userId: number): boolean {
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role?: string } | undefined;
  return row?.role === 'merchant';
}

/** 后台：为某套搭配添加上衣/裤子/鞋子槽位商家入驻（每槽最多 1 家，重复调用则更新） */
outfitsRouter.put('/:id/merchant-slots', requireAuth, (req: AuthRequest, res) => {
  const uid = Number(req.user?.userId || 0);
  if (!uid || !isMerchantUser(uid)) {
    return res.status(403).json({ error: '仅商家身份可操作' });
  }
  const outfitId = Number(req.params.id);
  const { slot, merchant_id, product_url, product_title } = req.body || {};
  if (!VALID_SLOTS.includes(slot)) {
    return res.status(400).json({ error: 'slot 须为 上衣、裤子、鞋子、配饰 之一' });
  }
  const merchantId = Number(merchant_id);
  if (!Number.isInteger(merchantId) || merchantId <= 0) {
    return res.status(400).json({ error: '请提供有效的 merchant_id' });
  }
  const outfit = db.prepare('SELECT id FROM outfits WHERE id = ?').get(outfitId);
  if (!outfit) return res.status(404).json({ error: '搭配不存在' });
  const merchant = db.prepare(
    "SELECT id FROM merchants WHERE id = ? AND COALESCE(verification_status, 'approved') = 'approved'"
  ).get(merchantId);
  if (!merchant) return res.status(404).json({ error: '商家不存在' });
  const existing = db.prepare('SELECT id FROM outfit_merchant_slots WHERE outfit_id = ? AND slot = ?').get(outfitId, slot);
  if (existing) {
    db.prepare(
      'UPDATE outfit_merchant_slots SET merchant_id = ?, product_url = ?, product_title = ?, created_at = datetime("now") WHERE outfit_id = ? AND slot = ?'
    ).run(merchantId, product_url ?? null, product_title ?? null, outfitId, slot);
  } else {
    db.prepare(
      'INSERT INTO outfit_merchant_slots (outfit_id, slot, merchant_id, product_url, product_title) VALUES (?, ?, ?, ?, ?)'
    ).run(outfitId, slot, merchantId, product_url ?? null, product_title ?? null);
  }
  const updated = db.prepare(
    'SELECT oms.*, m.name AS merchant_name FROM outfit_merchant_slots oms LEFT JOIN merchants m ON m.id = oms.merchant_id WHERE oms.outfit_id = ? AND oms.slot = ?'
  ).get(outfitId, slot);
  res.json(updated);
});

/** 后台：清空某套搭配的某个槽位（删除该槽位入驻） */
outfitsRouter.delete('/:id/merchant-slots/:slot', requireAuth, (req: AuthRequest, res) => {
  const uid = Number(req.user?.userId || 0);
  if (!uid || !isMerchantUser(uid)) {
    return res.status(403).json({ error: '仅商家身份可操作' });
  }
  const outfitId = Number(req.params.id);
  const slot = req.params.slot;
  if (!VALID_SLOTS.includes(slot)) {
    return res.status(400).json({ error: 'slot 须为 上衣、裤子、鞋子、配饰 之一' });
  }
  const outfit = db.prepare('SELECT id FROM outfits WHERE id = ?').get(outfitId);
  if (!outfit) return res.status(404).json({ error: '搭配不存在' });
  db.prepare('DELETE FROM outfit_merchant_slots WHERE outfit_id = ? AND slot = ?').run(outfitId, slot);
  res.status(204).send();
});
