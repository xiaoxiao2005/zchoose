// 简单测试 resale_items 相关 API：创建 -> 列表 -> 详情 -> 更新 -> 修改状态
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001';

function loadJwtSecret() {
  // 尝试从 .env 读取 JWT_SECRET，避免与实际配置不一致
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/JWT_SECRET=(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch {
    // ignore
  }
  return process.env.JWT_SECRET || 'dev-secret';
}

const TOKEN = jwt.sign({ userId: 1 }, loadJwtSecret());

async function request(path, options = {}) {
  const url = BASE + path;
  const res = await fetch(url, options);
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }
  console.log('---', options.method || 'GET', path, 'status:', res.status);
  console.log(bodyText);
  console.log('-----------');
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

async function main() {
  console.log('使用 TOKEN 测试 resale_items 接口');

  // 1. 创建一条闲置衣物
  const created = await request('/api/resale-items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + TOKEN,
    },
    body: JSON.stringify({
      title: '测试闲置衣物-黑色T恤',
      description: '自动化测试创建的闲置衣物',
      image_url: null,
      season_tags: ['夏'],
      occasion_tags: ['日常'],
      gender_tags: ['女'],
      age_tags: ['青年'],
      price: 19.9,
    }),
  });

  if (!created || !created.id) {
    console.error('创建失败，后续测试跳过');
    process.exit(1);
  }

  const id = created.id;
  console.log('创建成功，id =', id);

  // 2. 列表查询
  await request('/api/resale-items?type=user_idle&season=夏', {
    method: 'GET',
  });

  // 3. 详情
  await request(`/api/resale-items/${id}`, {
    method: 'GET',
  });

  // 4. 更新价格
  await request(`/api/resale-items/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + TOKEN,
    },
    body: JSON.stringify({
      price: 29.9,
    }),
  });

  // 5. 修改状态为 offline
  await request(`/api/resale-items/${id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + TOKEN,
    },
    body: JSON.stringify({
      status: 'offline',
    }),
  });

  console.log('resale_items CRUD 测试脚本执行完成');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

