import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

type SqlJsDatabase = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  close: () => void;
};

const TABLES_IN_ORDER = [
  'users',
  'payment_orders',
  'body_profiles',
  'outfits',
  'user_points',
  'user_points_ledger',
  'user_energy',
  'user_login_streak',
  'user_daily_quota',
  'user_unlocks',
  'user_outfit_likes',
  'user_wardrobe_items',
  'user_uploads',
  'tryon_results',
  'outfit_records',
  'merchants',
  'merchant_verification_requests',
  'outfit_merchant_slots',
  'merchant_size_rules',
  'resale_items',
  'user_submissions',
  'support_messages',
  'support_requests',
  'douyin_claims',
  'verification_codes',
  'password_reset_tokens',
] as const;

const BATCH_SIZE = 200;

function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

function getSingleColumnRows(db: SqlJsDatabase, sql: string): string[] {
  const result = db.exec(sql);
  if (!result.length) return [];
  return result[0].values.map((row) => String(row[0]));
}

function getSqliteTableColumns(db: SqlJsDatabase, table: string): string[] {
  const result = db.exec(`PRAGMA table_info(${quoteIdent(table)})`);
  if (!result.length) return [];
  const colIndex = result[0].columns.indexOf('name');
  if (colIndex < 0) return [];
  return result[0].values.map((row) => String(row[colIndex]));
}

function formatDateToMySql(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function normalizeValueForMySql(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== 'string') return value;

  const text = value.trim();
  if (!text) return value;

  // ISO 8601（例如 2026-05-04T18:22:58.417Z）转换为 MySQL DATETIME 字符串
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const dt = new Date(text);
    if (!Number.isNaN(dt.getTime())) {
      return formatDateToMySql(dt);
    }
  }
  return value;
}

async function loadSqlJs() {
  const initSqlJs = (await import('sql.js')).default;
  return initSqlJs();
}

async function main() {
  const shouldTruncate = process.argv.includes('--truncate');
  const sqlitePath = path.resolve(
    process.cwd(),
    process.env.DATABASE_PATH || './data/app.db'
  );

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite 文件不存在: ${sqlitePath}`);
  }

  const SQL = await loadSqlJs();
  const sqliteBinary = fs.readFileSync(sqlitePath);
  const sqliteDb = new SQL.Database(sqliteBinary) as SqlJsDatabase;

  const mysqlPool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'outfit_tryon',
    connectionLimit: 5,
    charset: 'utf8mb4',
  });

  const mysqlConn = await mysqlPool.getConnection();
  try {
    const sqliteTables = new Set(
      getSingleColumnRows(
        sqliteDb,
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
    );

    const tablesToMigrate = TABLES_IN_ORDER.filter((table) => sqliteTables.has(table));
    if (tablesToMigrate.length === 0) {
      console.log('未找到可迁移表，脚本结束。');
      return;
    }

    if (shouldTruncate) {
      await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of [...tablesToMigrate].reverse()) {
        await mysqlConn.query(`TRUNCATE TABLE ${quoteIdent(table)}`);
      }
      await mysqlConn.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('已清空目标 MySQL 表。');
    }

    for (const table of tablesToMigrate) {
      const sqliteColumns = getSqliteTableColumns(sqliteDb, table);
      if (!sqliteColumns.length) {
        console.log(`跳过 ${table}: SQLite 表无字段。`);
        continue;
      }

      const [mysqlColsRows] = await mysqlConn.query(`SHOW COLUMNS FROM ${quoteIdent(table)}`);
      const mysqlColumns = (mysqlColsRows as Array<{ Field: string }>).map((row) => row.Field);
      const commonColumns = sqliteColumns.filter((col) => mysqlColumns.includes(col));

      if (!commonColumns.length) {
        console.log(`跳过 ${table}: 无可映射字段。`);
        continue;
      }

      const selectSql = `SELECT ${commonColumns.map(quoteIdent).join(', ')} FROM ${quoteIdent(table)}`;
      const queryResult = sqliteDb.exec(selectSql);
      const rows = queryResult.length ? queryResult[0].values : [];

      if (rows.length === 0) {
        console.log(`${table}: 0 行（跳过写入）`);
        continue;
      }

      const insertColumnsSql = commonColumns.map(quoteIdent).join(', ');
      const updateColumns = commonColumns.filter((col) => col !== 'id');
      const updateSql =
        updateColumns.length > 0
          ? ` ON DUPLICATE KEY UPDATE ${updateColumns
              .map((col) => `${quoteIdent(col)}=VALUES(${quoteIdent(col)})`)
              .join(', ')}`
          : '';

      let migrated = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const placeholders = batch
          .map(() => `(${commonColumns.map(() => '?').join(', ')})`)
          .join(', ');
        const flatValues = batch.flat().map(normalizeValueForMySql);

        const insertSql = `INSERT INTO ${quoteIdent(table)} (${insertColumnsSql}) VALUES ${placeholders}${updateSql}`;
        await mysqlConn.query(insertSql, flatValues);
        migrated += batch.length;
      }

      console.log(`${table}: 已迁移 ${migrated} 行`);
    }

    console.log('SQLite -> MySQL 数据迁移完成。');
  } finally {
    mysqlConn.release();
    await mysqlPool.end();
    sqliteDb.close();
  }
}

main().catch((err) => {
  console.error('迁移失败:', err);
  process.exit(1);
});
