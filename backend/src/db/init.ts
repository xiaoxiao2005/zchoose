import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import deasync from 'deasync';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/app.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// sql.js 异步加载后赋值
let dbInstance: any | null = null;
let mysqlPool: mysql.Pool | null = null;
let activeProvider: 'sqlite' | 'mysql' = 'sqlite';

function getDb(): any {
  if (!dbInstance) throw new Error('数据库未初始化');
  return dbInstance;
}

function getMySqlPool(): mysql.Pool {
  if (!mysqlPool) throw new Error('MySQL 未初始化');
  return mysqlPool;
}

function rewriteSqlForMySql(sql: string): string {
  return sql
    .replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT IGNORE')
    .replace(/datetime\('now'\)/g, 'NOW()')
    .replace(/datetime\("now"\)/g, 'NOW()')
    // SQLite: RANDOM()；MySQL: RAND()。不转换时部分环境会报错或极慢，导致推荐接口超时。
    .replace(/\bRANDOM\s*\(\s*\)/gi, 'RAND()');
}

function waitForPromise<T>(promise: Promise<T>): T {
  let done = false;
  let value: T | undefined;
  let error: unknown;
  promise
    .then((v) => {
      value = v;
      done = true;
    })
    .catch((e) => {
      error = e;
      done = true;
    });
  deasync.loopWhile(() => !done);
  if (error) throw error;
  return value as T;
}

async function runMySqlSchema(pool: mysql.Pool): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      phone VARCHAR(64) UNIQUE,
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      wechat_openid VARCHAR(255) UNIQUE,
      qq_openid VARCHAR(255) UNIQUE,
      nickname VARCHAR(255),
      avatar_url TEXT,
      preferred_gender VARCHAR(32),
      preferred_age VARCHAR(32),
      role VARCHAR(32) DEFAULT 'user',
      is_member TINYINT DEFAULT 0,
      member_expires_at DATETIME NULL,
      member_tier VARCHAR(64) NULL,
      member_free_unlocks_remaining INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payment_orders (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      tier VARCHAR(64) NOT NULL,
      amount_cents INT NOT NULL,
      stripe_session_id VARCHAR(255) UNIQUE,
      status VARCHAR(32) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME NULL,
      INDEX idx_payment_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS body_profiles (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL UNIQUE,
      gender VARCHAR(32),
      height_cm INT,
      weight_kg INT,
      body_type VARCHAR(64),
      prompt_snippet TEXT,
      extra_prompt TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS outfits (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      image_url TEXT,
      style_tags TEXT,
      need_points INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_points (
      user_id BIGINT PRIMARY KEY,
      points INT DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_points_ledger (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      change_amount INT NOT NULL,
      reason TEXT,
      source VARCHAR(64),
      ref_id BIGINT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_points_ledger_user (user_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_energy (
      user_id BIGINT PRIMARY KEY,
      energy INT DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_login_streak (
      user_id BIGINT PRIMARY KEY,
      streak_days INT DEFAULT 0,
      last_login_date DATE NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_daily_quota (
      user_id BIGINT NOT NULL,
      quota_date DATE NOT NULL,
      tryon_used INT DEFAULT 0,
      download_used INT DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, quota_date)
    )`,
    `CREATE TABLE IF NOT EXISTS user_unlocks (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      outfit_id BIGINT NOT NULL,
      unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_outfit (user_id, outfit_id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_outfit_likes (
      user_id BIGINT NOT NULL,
      outfit_id BIGINT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, outfit_id)
    )`,
    `CREATE TABLE IF NOT EXISTS tryon_results (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      outfit_id BIGINT NOT NULL,
      wardrobe_item_id BIGINT NULL,
      photo_url TEXT,
      front_url TEXT,
      side_url TEXT,
      back_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_wardrobe_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      name VARCHAR(255),
      image_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_wardrobe_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_uploads (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      filename VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_uploads_user (user_id),
      INDEX idx_user_uploads_filename (filename)
    )`,
    `CREATE TABLE IF NOT EXISTS outfit_records (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      outfit_id BIGINT NOT NULL,
      occasion VARCHAR(64),
      weather_temp DOUBLE,
      weather_desc VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS merchants (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      owner_user_id BIGINT NULL,
      company_name VARCHAR(255),
      license_no VARCHAR(255),
      verification_status VARCHAR(32) DEFAULT 'approved',
      verified_at DATETIME NULL,
      monthly_fee INT NULL,
      status VARCHAR(32) DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS merchant_verification_requests (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      company_name VARCHAR(255),
      license_no VARCHAR(255),
      contact_name VARCHAR(255),
      contact_phone VARCHAR(64),
      status VARCHAR(32) DEFAULT 'pending',
      reviewer_id BIGINT NULL,
      review_note TEXT,
      reviewed_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_merchant_verify_user (user_id, id),
      INDEX idx_merchant_verify_status (status, id)
    )`,
    `CREATE TABLE IF NOT EXISTS outfit_merchant_slots (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      outfit_id BIGINT NOT NULL,
      slot VARCHAR(64) NOT NULL,
      merchant_id BIGINT NOT NULL,
      product_url TEXT,
      product_title VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_outfit_slot (outfit_id, slot)
    )`,
    `CREATE TABLE IF NOT EXISTS merchant_size_rules (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      merchant_id BIGINT NOT NULL,
      gender VARCHAR(32) NOT NULL,
      height_min_cm INT NOT NULL,
      height_max_cm INT NOT NULL,
      weight_min_kg DOUBLE NOT NULL,
      weight_max_kg DOUBLE NOT NULL,
      size VARCHAR(32) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS resale_items (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      owner_user_id BIGINT NULL,
      merchant_id BIGINT NULL,
      source_type VARCHAR(64) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      image_url TEXT,
      season_tags VARCHAR(255),
      occasion_tags VARCHAR(255),
      gender_tags VARCHAR(255),
      age_tags VARCHAR(255),
      price DOUBLE NOT NULL,
      currency VARCHAR(16) DEFAULT 'CNY',
      slot_fee DOUBLE DEFAULT 2,
      slot_fee_paid TINYINT DEFAULT 0,
      status VARCHAR(32) DEFAULT 'online',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_submissions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      image_url TEXT,
      description TEXT,
      status VARCHAR(32) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL
    )`,
    `CREATE TABLE IF NOT EXISTS support_messages (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      role VARCHAR(32) NOT NULL,
      content TEXT,
      image_url TEXT,
      is_transfer_human TINYINT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS support_requests (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      request_type VARCHAR(64) NOT NULL,
      content TEXT,
      status VARCHAR(32) DEFAULT 'pending',
      handled_by BIGINT NULL,
      handle_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_support_requests_status (status, id)
    )`,
    `CREATE TABLE IF NOT EXISTS douyin_claims (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      link TEXT,
      image_url TEXT,
      status VARCHAR(32) DEFAULT 'pending',
      outfit_id BIGINT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL
    )`,
    `CREATE TABLE IF NOT EXISTS verification_codes (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      target VARCHAR(255) NOT NULL,
      type VARCHAR(32) NOT NULL,
      code VARCHAR(16) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_verification_codes_target_type (target, type)
    )`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  ];

  for (const sql of statements) {
    await pool.query(sql);
  }
}

function runSchema(d: any): void {
  const normalizeOutfitName = (raw: string): string => {
    const text = String(raw || '').trim();
    if (!text) return text;
    // 清理文件名尾部的随机串：如 -3ud5w1sbi04mnoq8f / _a8f7c9d1e2b3
    return text
      .replace(/[-_][a-z0-9]{10,}$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  // 用户表：支持邮箱/手机号注册登录，password_hash 必填，wechat/qq 为 OAuth 预留
  d.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      wechat_openid TEXT UNIQUE,
      qq_openid TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  try {
    d.run('ALTER TABLE users ADD COLUMN wechat_openid TEXT UNIQUE');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN qq_openid TEXT UNIQUE');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN nickname TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN avatar_url TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN preferred_gender TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN preferred_age TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN is_member INTEGER DEFAULT 0');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN member_expires_at TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN member_tier TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE users ADD COLUMN member_free_unlocks_remaining INTEGER DEFAULT 0');
  } catch (_) { /* 已存在 */ }
  d.run(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tier TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      stripe_session_id TEXT UNIQUE,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS body_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      gender TEXT,
      height_cm INTEGER,
      weight_kg INTEGER,
      body_type TEXT,
      prompt_snippet TEXT,
      extra_prompt TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  try {
    d.run('ALTER TABLE body_profiles ADD COLUMN extra_prompt TEXT');
  } catch (_) {
    /* 已存在则忽略 */
  }
  d.run(`
    CREATE TABLE IF NOT EXISTS outfits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT,
      style_tags TEXT,
      need_points INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  // 删除占位搭配：示例搭配1～6、示例搭配一～六、1-日常、2-rc
  try {
    const placeholderNames = ['1-日常', '2-rc'];
    for (const name of placeholderNames) {
      const del = d.prepare('DELETE FROM outfits WHERE name = ?');
      del.bind([name]);
      del.step();
      del.free();
    }
    // 示例搭配+单个字符（1～6 或 一～六）：SQLite GLOB 匹配
    d.run("DELETE FROM outfits WHERE name GLOB '示例搭配[123456]' OR name GLOB '示例搭配[一二三四五六]'");
  } catch (_) {
    // 表可能尚未创建，忽略
  }

  // 清洗历史衣库名称：移除尾部随机串，避免前端出现长串噪音
  try {
    const rows = d.exec('SELECT id, name FROM outfits');
    if (rows.length > 0) {
      const values = rows[0].values as unknown[][];
      const upd = d.prepare('UPDATE outfits SET name = ? WHERE id = ?');
      for (const row of values) {
        const id = Number(row[0]);
        const name = String(row[1] ?? '');
        const cleaned = normalizeOutfitName(name);
        if (cleaned && cleaned !== name) {
          upd.bind([cleaned, id]);
          upd.step();
          upd.reset();
        }
      }
      upd.free();
    }
  } catch (_) {
    // 忽略历史数据清洗异常
  }

  /** 需要积分解锁的仅为「星座专属」；默认 0 为免费 */
  const NEED_POINTS_SPECIAL = 10;
  const ensureOutfit = (name: string, imageUrl: string, styleTags: string, needPoints: number = 0) => {
    const normalizedName = normalizeOutfitName(name);
    if (!normalizedName || normalizedName.trim() === '') return;
    const check = d.prepare('SELECT 1 FROM outfits WHERE name = ? LIMIT 1');
    check.bind([normalizedName]);
    const has = check.step();
    check.free();
    if (!has) {
      const ins = d.prepare('INSERT INTO outfits (name, image_url, style_tags, need_points) VALUES (?, ?, ?, ?)');
      ins.bind([normalizedName, imageUrl ?? '', styleTags ?? '', needPoints]);
      ins.step();
      ins.free();
      console.log('已插入衣库搭配：' + normalizedName + (needPoints > 0 ? `（需${needPoints}积分）` : ''));
    }
  };

  // 衣库：扫描 frontend/public/images 下各分类目录，加载目录内全部图片
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];

  const monthNow = new Date().getMonth() + 1;
  const seasonNow =
    monthNow >= 3 && monthNow <= 5 ? '春' : monthNow >= 6 && monthNow <= 8 ? '夏' : monthNow >= 9 && monthNow <= 11 ? '秋' : '冬';

  // 职场通勤（男 18-24）：来源目录「职场通勤-男18-22岁（校园职场）」统一归入 18-24
  // 注意：前端采用“当季-only”策略，需包含当前季节标签（春/夏/秋/冬）才能被筛出。
  const TAG_COMMUTE_SPRING_MALE_18_24 = `通勤,${seasonNow},男,18-24`;
  const commuteMale1822Dir = path.join(__dirname, '../../../frontend/public/images/职场通勤-男18-22岁（校园职场）');
  if (fs.existsSync(commuteMale1822Dir)) {
    const files = fs.readdirSync(commuteMale1822Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    // 用「文件名主干」命名，避免按序号重扫时同一文件被编成不同序号导致重复入库
    imageFiles.forEach((file) => {
      const stem = path.parse(file).name;
      const name = `职场通勤-男-18-24-${stem}`;
      const imageUrl = `/images/职场通勤-男18-22岁（校园职场）/${file}`;
      ensureOutfit(name, imageUrl, TAG_COMMUTE_SPRING_MALE_18_24);
    });
  }

  // 职场通勤（女 18-24）：目录「职场通勤-女-18-24」映射到 通勤+当季+女+18-24
  const TAG_COMMUTE_SPRING_FEMALE_18_24 = `通勤,${seasonNow},女,18-24`;
  const commuteFemale1824Dir = path.join(__dirname, '../../../frontend/public/images/职场通勤-女-18-24');
  if (fs.existsSync(commuteFemale1824Dir)) {
    const files = fs.readdirSync(commuteFemale1824Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file) => {
      const stem = path.parse(file).name;
      const name = `职场通勤-女-18-24-${stem}`;
      const imageUrl = `/images/职场通勤-女-18-24/${file}`;
      ensureOutfit(name, imageUrl, TAG_COMMUTE_SPRING_FEMALE_18_24);
    });
  }

  // 职场通勤（女 25-29）：目录「职场通勤-女-25-29」映射到 通勤+当季+女+25-29
  const TAG_COMMUTE_SPRING_FEMALE_25_29 = `通勤,${seasonNow},女,25-29`;
  const commuteFemale2529Dir = path.join(__dirname, '../../../frontend/public/images/职场通勤-女-25-29');
  if (fs.existsSync(commuteFemale2529Dir)) {
    const files = fs.readdirSync(commuteFemale2529Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file) => {
      const stem = path.parse(file).name;
      const name = `职场通勤-女-25-29-${stem}`;
      const imageUrl = `/images/职场通勤-女-25-29/${file}`;
      ensureOutfit(name, imageUrl, TAG_COMMUTE_SPRING_FEMALE_25_29);
    });
  }

  // 运动出行（男 25-29）：前端场合「运动出行」对应标签「运动」；目录「运动出行-男-25-29」→ 运动+当季+男+25-29
  const TAG_SPORT_SPRING_MALE_25_29 = `运动,${seasonNow},男,25-29`;
  const sportMale2529Dir = path.join(__dirname, '../../../frontend/public/images/运动出行-男-25-29');
  if (fs.existsSync(sportMale2529Dir)) {
    const files = fs.readdirSync(sportMale2529Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file) => {
      const stem = path.parse(file).name;
      const name = `运动出行-男-25-29-${stem}`;
      const imageUrl = `/images/运动出行-男-25-29/${file}`;
      ensureOutfit(name, imageUrl, TAG_SPORT_SPRING_MALE_25_29);
    });
  }

  // 节日家庭（男 18-24）：前端场合「节日家庭」对应标签「过年」
  const TAG_FESTIVAL_MALE_18_24 = `过年,${seasonNow},男,18-24`;
  const festivalMale1824Dir = path.join(__dirname, '../../../frontend/public/images/节日家庭-男-18-24');
  if (fs.existsSync(festivalMale1824Dir)) {
    const files = fs.readdirSync(festivalMale1824Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `节日家庭-男-18-24-${i + 1}`;
      const imageUrl = `/images/节日家庭-男-18-24/${file}`;
      ensureOutfit(name, imageUrl, TAG_FESTIVAL_MALE_18_24);
    });
  }

  // 节日家庭（男 25-29）
  const TAG_FESTIVAL_MALE_25_29 = `过年,${seasonNow},男,25-29`;
  const festivalMale2529Dir = path.join(__dirname, '../../../frontend/public/images/节日家庭-男-25-29');
  if (fs.existsSync(festivalMale2529Dir)) {
    const files = fs.readdirSync(festivalMale2529Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `节日家庭-男-25-29-${i + 1}`;
      const imageUrl = `/images/节日家庭-男-25-29/${file}`;
      ensureOutfit(name, imageUrl, TAG_FESTIVAL_MALE_25_29);
    });
  }

  // 日常-春-男-少年（12-18）
  const TAG_DAILY_SPRING_MALE_YOUTH = '日常,春,男,少年';
  const dailySpringMaleYouthDir = path.join(__dirname, '../../../frontend/public/images/日常-春-男-12-18');
  if (fs.existsSync(dailySpringMaleYouthDir)) {
    const files = fs.readdirSync(dailySpringMaleYouthDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-春-男-少年-${i + 1}`;
      const imageUrl = `/images/日常-春-男-12-18/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SPRING_MALE_YOUTH);
    });
  }

  // 日常-春-女-少年（12-18）
  const TAG_DAILY_SPRING_FEMALE_YOUTH = '日常,春,女,少年';
  const dailySpringFemaleYouthDir = path.join(__dirname, '../../../frontend/public/images/日常-春-女-12-18');
  if (fs.existsSync(dailySpringFemaleYouthDir)) {
    const files = fs.readdirSync(dailySpringFemaleYouthDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-春-女-少年-${i + 1}`;
      const imageUrl = `/images/日常-春-女-12-18/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SPRING_FEMALE_YOUTH);
    });
  }

  // 日常休闲（女 18-24）：目录「日常休闲-女-18-24」映射到 日常+当季+女+18-24
  const TAG_DAILY_FEMALE_18_24 = `日常,${seasonNow},女,18-24`;
  const dailyFemale1824Dir = path.join(__dirname, '../../../frontend/public/images/日常休闲-女-18-24');
  if (fs.existsSync(dailyFemale1824Dir)) {
    const files = fs.readdirSync(dailyFemale1824Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file) => {
      const stem = path.parse(file).name;
      const name = `日常休闲-女-18-24-${stem}`;
      const imageUrl = `/images/日常休闲-女-18-24/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_FEMALE_18_24);
    });
  }

  // 日常休闲（女 25-29）：目录「日常休闲-女-25-29」映射到 日常+当季+女+25-29
  const TAG_DAILY_FEMALE_25_29 = `日常,${seasonNow},女,25-29`;
  const dailyFemale2529Dir = path.join(__dirname, '../../../frontend/public/images/日常休闲-女-25-29');
  if (fs.existsSync(dailyFemale2529Dir)) {
    const files = fs.readdirSync(dailyFemale2529Dir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file) => {
      const stem = path.parse(file).name;
      const name = `日常休闲-女-25-29-${stem}`;
      const imageUrl = `/images/日常休闲-女-25-29/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_FEMALE_25_29);
    });
  }

  // 日常-春-女-青年（18-35）
  const TAG_DAILY_SPRING_FEMALE_ADULT = '日常,春,女,青年';
  const dailySpringFemaleAdultDir = path.join(__dirname, '../../../frontend/public/images/日常-春-女-18-35');
  if (fs.existsSync(dailySpringFemaleAdultDir)) {
    const files = fs.readdirSync(dailySpringFemaleAdultDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-春-女-青年-${i + 1}`;
      const imageUrl = `/images/日常-春-女-18-35/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SPRING_FEMALE_ADULT);
    });
  }

  // 日常-春-女-中年（35-50）
  const TAG_DAILY_SPRING_FEMALE_MIDDLE = '日常,春,女,中年';
  const dailySpringFemaleMiddleDir = path.join(__dirname, '../../../frontend/public/images/日常-春-女-35-50');
  if (fs.existsSync(dailySpringFemaleMiddleDir)) {
    const files = fs.readdirSync(dailySpringFemaleMiddleDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-春-女-中年-${i + 1}`;
      const imageUrl = `/images/日常-春-女-35-50/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SPRING_FEMALE_MIDDLE);
    });
  }

  // 日常-春-男-青年（18-35）
  const TAG_DAILY_SPRING_MALE_ADULT = '日常,春,男,青年';
  const dailySpringMaleAdultDir = path.join(__dirname, '../../../frontend/public/images/日常-春-男-18-35');
  if (fs.existsSync(dailySpringMaleAdultDir)) {
    const files = fs.readdirSync(dailySpringMaleAdultDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-春-男-青年-${i + 1}`;
      const imageUrl = `/images/日常-春-男-18-35/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SPRING_MALE_ADULT);
    });
  }

  // 日常-夏-男-青年（18-35）：用户选择 日常+夏+男+青年 时显示
  const TAG_DAILY_SUMMER_MALE_ADULT = '日常,夏,男,青年';
  const dailySummerMaleAdultDir = path.join(__dirname, '../../../frontend/public/images/日常-夏-男-18-35');
  if (fs.existsSync(dailySummerMaleAdultDir)) {
    const files = fs.readdirSync(dailySummerMaleAdultDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-夏-男-青年-${i + 1}`;
      const imageUrl = `/images/日常-夏-男-18-35/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SUMMER_MALE_ADULT);
    });
  }

  // 日常-夏-女-青年（18-35）：用户选择 日常+夏+女+青年 时显示
  const TAG_DAILY_SUMMER_FEMALE_ADULT = '日常,夏,女,青年';
  const dailySummerFemaleAdultDir = path.join(__dirname, '../../../frontend/public/images/日常-夏-女-18-35');
  if (fs.existsSync(dailySummerFemaleAdultDir)) {
    const files = fs.readdirSync(dailySummerFemaleAdultDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-夏-女-青年-${i + 1}`;
      const imageUrl = `/images/日常-夏-女-18-35/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SUMMER_FEMALE_ADULT);
    });
  }

  // 日常-春-男-中年（35-50）
  const TAG_DAILY_SPRING_MALE_MIDDLE = '日常,春,男,中年';
  const dailySpringMaleMiddleDir = path.join(__dirname, '../../../frontend/public/images/日常-春-男-35-50');
  if (fs.existsSync(dailySpringMaleMiddleDir)) {
    const files = fs.readdirSync(dailySpringMaleMiddleDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-春-男-中年-${i + 1}`;
      const imageUrl = `/images/日常-春-男-35-50/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SPRING_MALE_MIDDLE);
    });
  }

  // 日常-春-男-老年（50岁以上）
  const TAG_DAILY_SPRING_MALE_ELDER = '日常,春,男,老年';
  const dailySpringMaleElderDir = path.join(__dirname, '../../../frontend/public/images/日常-春-男-50以上');
  if (fs.existsSync(dailySpringMaleElderDir)) {
    const files = fs.readdirSync(dailySpringMaleElderDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `日常-春-男-老年-${i + 1}`;
      const imageUrl = `/images/日常-春-男-50以上/${file}`;
      ensureOutfit(name, imageUrl, TAG_DAILY_SPRING_MALE_ELDER);
    });
  }

  // 星座专属穿搭：需积分解锁（need_points = NEED_POINTS_SPECIAL）
  const imagesBase = path.join(__dirname, '../../../frontend/public/images');
  const specialDirs = [
    { dir: '星座专属', tag: '星座专属' },
  ];
  specialDirs.forEach(({ dir, tag }) => {
    const fullPath = path.join(imagesBase, dir);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) return;
    const files = fs.readdirSync(fullPath);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `${dir}-${i + 1}`;
      const imageUrl = `/images/${dir}/${file}`;
      ensureOutfit(name, imageUrl, tag, NEED_POINTS_SPECIAL);
    });
  });

  // 星座专属穿搭子目录：摩羯女-夏季-日常 → 标签仅 星座专属,摩羯女,夏,女,青年（不包含日常）；仅当用户选「星座专属穿搭+夏+女+青年」时显示，选「日常+夏+女+青年」不显示
  const tagCapricornNoDaily = '星座专属,摩羯女,夏,女,青年';
  const capricornDir = path.join(imagesBase, '星座专属穿搭', '摩羯女-夏季-日常');
  if (fs.existsSync(capricornDir) && fs.statSync(capricornDir).isDirectory()) {
    const files = fs.readdirSync(capricornDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `摩羯女-夏季-日常-${i + 1}`;
      const imageUrl = `/images/星座专属穿搭/摩羯女-夏季-日常/${file}`;
      ensureOutfit(name, imageUrl, tagCapricornNoDaily, NEED_POINTS_SPECIAL);
    });
  }
  // 把已存在的摩羯女-夏季-日常 搭配的标签改为不含「日常」，否则旧数据刷新后仍会出现在「日常+夏+女+青年」下
  try {
    d.run(
      "UPDATE outfits SET style_tags = ? WHERE name LIKE '摩羯女-夏季-日常-%'",
      [tagCapricornNoDaily]
    );
  } catch (_) { /* 忽略 */ }
  // 统一规则：凡 style_tags 含「星座专属」的搭配均需积分解锁（含后续手动/API 新增）
  try {
    d.run(
      `UPDATE outfits SET need_points = ? WHERE style_tags LIKE '%星座专属%' AND (need_points IS NULL OR need_points = 0)`,
      [NEED_POINTS_SPECIAL]
    );
  } catch (_) { /* 忽略 */ }

  // 时装秀场：仅标签「时装秀场」；衣库页选该风格时不与其它维度组合（见前端 Outfits.tsx）
  const TAG_FASHION_SHOW = '时装秀场';
  const fashionShowDir = path.join(imagesBase, '时装秀场');
  if (fs.existsSync(fashionShowDir) && fs.statSync(fashionShowDir).isDirectory()) {
    const files = fs.readdirSync(fashionShowDir);
    const imageFiles = files
      .filter((f) => imageExts.some((ext) => f.toLowerCase().endsWith(ext)))
      .sort();
    imageFiles.forEach((file, i) => {
      const name = `时装秀场-${i + 1}`;
      const imageUrl = `/images/时装秀场/${file}`;
      ensureOutfit(name, imageUrl, TAG_FASHION_SHOW);
    });
  }
  try {
    d.run('UPDATE outfits SET style_tags = ? WHERE name LIKE ?', [TAG_FASHION_SHOW, '时装秀场-%']);
  } catch (_) {
    /* 忽略 */
  }

  d.run(`
    CREATE TABLE IF NOT EXISTS user_points (
      user_id INTEGER PRIMARY KEY,
      points INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS user_points_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      change_amount INTEGER NOT NULL,
      reason TEXT,
      source TEXT,
      ref_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  try {
    d.run('CREATE INDEX IF NOT EXISTS idx_user_points_ledger_user ON user_points_ledger (user_id, id DESC)');
  } catch (_) { /* ignore */ }
  d.run(`
    CREATE TABLE IF NOT EXISTS user_energy (
      user_id INTEGER PRIMARY KEY,
      energy INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS user_login_streak (
      user_id INTEGER PRIMARY KEY,
      streak_days INTEGER DEFAULT 0,
      last_login_date TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  // 每日额度：试衣 5 次/天、下载 5 次/天（等价每日 50 试衣积分，生成一次扣 10）
  d.run(`
    CREATE TABLE IF NOT EXISTS user_daily_quota (
      user_id INTEGER NOT NULL,
      quota_date TEXT NOT NULL,
      tryon_used INTEGER DEFAULT 0,
      download_used INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, quota_date),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  // 迁移：若表已存在但缺少 quota_date 列（旧版表结构），则重建表
  try {
    const pragma = d.prepare('PRAGMA table_info(user_daily_quota)');
    let hasQuotaDate = false;
    while (pragma.step()) {
      const row = pragma.getAsObject() as { name: string };
      if (row.name === 'quota_date') {
        hasQuotaDate = true;
        break;
      }
    }
    pragma.free();
    if (!hasQuotaDate) {
      d.run('DROP TABLE IF EXISTS user_daily_quota');
      d.run(`
        CREATE TABLE user_daily_quota (
          user_id INTEGER NOT NULL,
          quota_date TEXT NOT NULL,
          tryon_used INTEGER DEFAULT 0,
          download_used INTEGER DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, quota_date),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);
    }
  } catch (_) {
    /* 忽略迁移异常 */
  }
  d.run(`
    CREATE TABLE IF NOT EXISTS user_unlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      outfit_id INTEGER NOT NULL,
      unlocked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, outfit_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (outfit_id) REFERENCES outfits(id)
    );
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS user_outfit_likes (
      user_id INTEGER NOT NULL,
      outfit_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, outfit_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (outfit_id) REFERENCES outfits(id)
    );
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS tryon_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      outfit_id INTEGER NOT NULL,
      wardrobe_item_id INTEGER,
      photo_url TEXT,
      front_url TEXT,
      side_url TEXT,
      back_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (outfit_id) REFERENCES outfits(id)
    );
  `);
  try {
    d.run('ALTER TABLE tryon_results ADD COLUMN wardrobe_item_id INTEGER');
  } catch (_) {
    /* 已存在 */
  }
  d.run(`
    CREATE TABLE IF NOT EXISTS user_wardrobe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT,
      image_url TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  try {
    d.run('CREATE INDEX IF NOT EXISTS idx_user_wardrobe_user ON user_wardrobe_items (user_id)');
  } catch (_) { /* ignore */ }
  // 用户上传文件归属与隐私：仅本人或带有效 token 可访问
  d.run(`
    CREATE TABLE IF NOT EXISTS user_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  try {
    d.run('CREATE INDEX IF NOT EXISTS idx_user_uploads_user ON user_uploads (user_id)');
    d.run('CREATE INDEX IF NOT EXISTS idx_user_uploads_filename ON user_uploads (filename)');
  } catch (_) { /* 已存在 */ }
  d.run(`
    CREATE TABLE IF NOT EXISTS outfit_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      outfit_id INTEGER NOT NULL,
      occasion TEXT,
      weather_temp REAL,
      weather_desc TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (outfit_id) REFERENCES outfits(id)
    );
  `);
  // 商家合作：商家表 + 尺码规则（身高体重区间 -> 尺码）
  d.run(`
    CREATE TABLE IF NOT EXISTS merchants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  try {
    d.run('ALTER TABLE merchants ADD COLUMN owner_user_id INTEGER');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE merchants ADD COLUMN company_name TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE merchants ADD COLUMN license_no TEXT');
  } catch (_) { /* 已存在 */ }
  try {
    d.run("ALTER TABLE merchants ADD COLUMN verification_status TEXT DEFAULT 'approved'");
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE merchants ADD COLUMN verified_at TEXT');
  } catch (_) { /* 已存在 */ }
  d.run(`
    CREATE TABLE IF NOT EXISTS merchant_verification_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      company_name TEXT,
      license_no TEXT,
      contact_name TEXT,
      contact_phone TEXT,
      status TEXT DEFAULT 'pending', -- pending / approved / rejected
      reviewer_id INTEGER,
      review_note TEXT,
      reviewed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (reviewer_id) REFERENCES users(id)
    );
  `);
  try {
    d.run('CREATE INDEX IF NOT EXISTS idx_merchant_verify_user ON merchant_verification_requests (user_id, id DESC)');
    d.run('CREATE INDEX IF NOT EXISTS idx_merchant_verify_status ON merchant_verification_requests (status, id DESC)');
  } catch (_) { /* ignore */ }
  try {
    d.run('ALTER TABLE merchants ADD COLUMN monthly_fee INTEGER');
  } catch (_) { /* 已存在 */ }
  try {
    d.run('ALTER TABLE merchants ADD COLUMN status TEXT DEFAULT \'active\'');
  } catch (_) { /* 已存在 */ }
  // 衣库每套搭配的商家入驻槽位：上衣/裤子/鞋子各一槽，每槽最多 1 家商家（可扩展为每槽多家）
  d.run(`
    CREATE TABLE IF NOT EXISTS outfit_merchant_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outfit_id INTEGER NOT NULL,
      slot TEXT NOT NULL,
      merchant_id INTEGER NOT NULL,
      product_url TEXT,
      product_title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(outfit_id, slot),
      FOREIGN KEY (outfit_id) REFERENCES outfits(id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS merchant_size_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL,
      gender TEXT NOT NULL,
      height_min_cm INTEGER NOT NULL,
      height_max_cm INTEGER NOT NULL,
      weight_min_kg REAL NOT NULL,
      weight_max_kg REAL NOT NULL,
      size TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );
  `);
  // 闲置 / 过季衣物流转：支持用户闲置与商家过季货
  d.run(`
    CREATE TABLE IF NOT EXISTS resale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER,
      merchant_id INTEGER,
      source_type TEXT NOT NULL, -- user_idle / merchant_clearance
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      season_tags TEXT,
      occasion_tags TEXT,
      gender_tags TEXT,
      age_tags TEXT,
      price REAL NOT NULL,
      currency TEXT DEFAULT 'CNY',
      slot_fee REAL DEFAULT 2,
      slot_fee_paid INTEGER DEFAULT 0,
      status TEXT DEFAULT 'online', -- online / offline / sold / draft
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_user_id) REFERENCES users(id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );
  `);
  const merchantStmt = d.prepare('SELECT COUNT(*) AS c FROM merchants');
  merchantStmt.step();
  const merchantCount = (merchantStmt.getAsObject() as { c: number }).c;
  merchantStmt.free();
  if (merchantCount === 0) {
    d.run("INSERT INTO merchants (name, verification_status, verified_at) VALUES ('示例商家', 'approved', datetime('now'))");
    const midStmt = d.prepare('SELECT id FROM merchants LIMIT 1');
    midStmt.step();
    const mid = (midStmt.getAsObject() as { id: number }).id;
    midStmt.free();
    const ins = d.prepare('INSERT INTO merchant_size_rules (merchant_id, gender, height_min_cm, height_max_cm, weight_min_kg, weight_max_kg, size) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const femaleRules: [number, string, number, number, number, number, string][] = [
      [mid, '女', 150, 158, 40, 50, 'S'],
      [mid, '女', 156, 164, 48, 56, 'M'],
      [mid, '女', 162, 170, 54, 62, 'L'],
      [mid, '女', 168, 176, 60, 70, 'XL'],
      [mid, '女', 174, 185, 68, 80, 'XXL'],
    ];
    femaleRules.forEach((r) => { ins.bind(r); ins.step(); ins.reset(); });
    const maleRules: [number, string, number, number, number, number, string][] = [
      [mid, '男', 160, 168, 50, 60, 'S'],
      [mid, '男', 166, 174, 58, 68, 'M'],
      [mid, '男', 172, 180, 66, 76, 'L'],
      [mid, '男', 178, 186, 74, 86, 'XL'],
      [mid, '男', 184, 195, 82, 95, 'XXL'],
    ];
    maleRules.forEach((r) => { ins.bind(r); ins.step(); ins.reset(); });
    ins.free();
  }
  // 用户投稿搭配（智能客服采纳后加积分）
  d.run(`
    CREATE TABLE IF NOT EXISTS user_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      image_url TEXT,
      description TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  // 客服对话与转人工/留言
  d.run(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      image_url TEXT,
      is_transfer_human INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  d.run(`
    CREATE TABLE IF NOT EXISTS support_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      request_type TEXT NOT NULL, -- points_or_membership
      content TEXT,
      status TEXT DEFAULT 'pending', -- pending / contacted / completed / closed
      handled_by INTEGER,
      handle_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (handled_by) REFERENCES users(id)
    );
  `);
  try {
    d.run('CREATE INDEX IF NOT EXISTS idx_support_requests_status ON support_requests (status, id DESC)');
  } catch (_) { /* ignore */ }
  // 抖音分享核销：用户提交链接/截图，核验通过后解锁一套
  d.run(`
    CREATE TABLE IF NOT EXISTS douyin_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      link TEXT,
      image_url TEXT,
      status TEXT DEFAULT 'pending',
      outfit_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (outfit_id) REFERENCES outfits(id)
    );
  `);
  // 注册验证码：target=邮箱或手机号，type=email|phone，code=6 位数字，5 分钟有效（send-code 写入，register 校验后删除）
  d.run(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  try {
    d.run('CREATE INDEX IF NOT EXISTS idx_verification_codes_target_type ON verification_codes (target, type)');
  } catch (_) { /* 已存在 */ }
  // 忘记密码：邮箱 + 重置 token，有效期 1 小时
  d.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export async function initDb(): Promise<void> {
  const dbProvider = (process.env.DB_PROVIDER || 'sqlite').toLowerCase();
  activeProvider = dbProvider === 'mysql' ? 'mysql' : 'sqlite';

  if (activeProvider === 'mysql') {
    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'outfit_tryon',
      connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
      charset: 'utf8mb4',
    });
    await runMySqlSchema(getMySqlPool());
    console.log('MySQL 已初始化');
    return;
  }

  const initSqlJs = (await import('sql.js')).default;
  // Node 环境下可不传 locateFile，会自动从 node_modules 加载 wasm
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(buf);
  } else {
    dbInstance = new SQL.Database();
  }
  runSchema(dbInstance);
  console.log('SQLite (sql.js) 已初始化');
}

export function saveDb(): void {
  if (activeProvider === 'mysql') return;
  if (!dbInstance) return;
  const data = dbInstance.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// 兼容 better-sqlite3 的 db.prepare(sql).run/get/all（sql.js 无 get/all，用 prepare+bind+step+getAsObject 实现）
export const db = {
  prepare(sql: string) {
    if (activeProvider === 'mysql') {
      const pool = getMySqlPool();
      const rewrittenSql = rewriteSqlForMySql(sql);
      return {
        run: (...params: unknown[]) => {
          const [result] = waitForPromise(pool.query(rewrittenSql, params));
          const packet = result as mysql.ResultSetHeader;
          return {
            lastInsertRowid: Number(packet.insertId || 0),
            changes: Number(packet.affectedRows || 0),
          };
        },
        get: (...params: unknown[]) => {
          const [rows] = waitForPromise(pool.query(rewrittenSql, params));
          const list = rows as Record<string, unknown>[];
          return list[0];
        },
        all: (...params: unknown[]) => {
          const [rows] = waitForPromise(pool.query(rewrittenSql, params));
          return rows as unknown[];
        },
      };
    }

    const d = getDb();
    return {
      run: (...params: unknown[]) => {
        d.run(sql, params as (string | number)[]);
        // sql.js 无 getLastInsertRowid，用 SELECT last_insert_rowid() 获取
        let lastInsertRowid = 0;
        try {
          const stmt = d.prepare('SELECT last_insert_rowid() AS id');
          if (stmt.step()) lastInsertRowid = Number((stmt.getAsObject() as { id: number }).id);
          stmt.free();
        } catch (_) { /* ignore */ }
        return { lastInsertRowid, changes: d.getRowsModified() };
      },
      get: (...params: unknown[]) => {
        const stmt = d.prepare(sql, params as (string | number)[]);
        try {
          const hasRow = stmt.step();
          return (hasRow ? stmt.getAsObject() : undefined) as unknown;
        } finally {
          stmt.free();
        }
      },
      all: (...params: unknown[]) => {
        const stmt = d.prepare(sql, params as (string | number)[]);
        const rows: Record<string, unknown>[] = [];
        try {
          while (stmt.step()) rows.push(stmt.getAsObject() as Record<string, unknown>);
          return rows as unknown[];
        } finally {
          stmt.free();
        }
      },
    };
  },
  exec(_sql: string) {
    if (activeProvider === 'mysql') throw new Error('MySQL 模式下请使用 db.prepare(sql).run/get/all');
    getDb().exec(_sql);
  },
};
