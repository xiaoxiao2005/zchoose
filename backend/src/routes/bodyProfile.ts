import { Router } from 'express';
import { db } from '../db/init';

// 体型 value → 提示词片段（先写死，后续可放配置表）
const BODY_PROMPT: Record<string, string> = {
  // 女生
  pear: '梨型身材，下半身较丰满，建议上紧下松、突出腰线。',
  inv_triangle_f: '倒三角型，肩宽臀窄，建议弱化肩部、适当增加下半身量感。',
  hourglass: '沙漏型，腰细胸臀丰满，适合收腰、凸显曲线的款式。',
  h_type: 'H型，肩腰臀比例接近，可通过腰带、版型制造腰线。',
  apple: '苹果型，腰腹较圆润，建议宽松上衣、高腰下装，避免紧身腰。',
  // 男生
  o_type: 'O型，腰腹圆润，建议直线条、略宽松，避免紧身。',
  triangle: '正三角型，肩窄臀宽，建议增加肩部量感、上宽下收。',
  rectangle: '矩形，肩腰臀接近，可通过层次与版型增加线条感。',
  inv_triangle_m: '倒三角型，肩宽腰细，适合多数版型，注意肩线合身。',
  inv_trapezoid: '倒梯型，肩宽臀窄，建议保持上下平衡、避免头重脚轻。',
};

const BODY_OPTIONS_FEMALE = [
  { value: 'pear', label: '梨型', imageUrl: '/images/body-ref/female/pear.svg' },
  { value: 'inv_triangle_f', label: '倒三角型', imageUrl: '/images/body-ref/female/inv_triangle.svg' },
  { value: 'hourglass', label: '沙漏型', imageUrl: '/images/body-ref/female/hourglass.svg' },
  { value: 'h_type', label: 'H型', imageUrl: '/images/body-ref/female/h_type.svg' },
  { value: 'apple', label: '苹果型', imageUrl: '/images/body-ref/female/apple.svg' },
];

const BODY_OPTIONS_MALE = [
  { value: 'o_type', label: 'O型', imageUrl: '/images/body-ref/male/o_type.svg' },
  { value: 'triangle', label: '正三角型', imageUrl: '/images/body-ref/male/triangle.svg' },
  { value: 'rectangle', label: '矩形', imageUrl: '/images/body-ref/male/rectangle.svg' },
  { value: 'inv_triangle_m', label: '倒三角型', imageUrl: '/images/body-ref/male/inv_triangle.svg' },
  { value: 'inv_trapezoid', label: '倒梯型', imageUrl: '/images/body-ref/male/inv_trapezoid.svg' },
];

export const bodyProfileRouter = Router();

// 体型选项按性别返回：{ female: [...], male: [...] }，供前端根据性别展示对应体型参考图
bodyProfileRouter.get('/options', (_req, res) => {
  res.json({ female: BODY_OPTIONS_FEMALE, male: BODY_OPTIONS_MALE });
});

/** 商家列表：供试衣页「按商家尺码」下拉使用 */
bodyProfileRouter.get('/merchants', (_req, res) => {
  const rows = db.prepare(
    "SELECT id, name FROM merchants WHERE COALESCE(verification_status, 'approved') = 'approved' ORDER BY id"
  ).all() as { id: number; name: string }[];
  res.json({ merchants: rows });
});

/**
 * 体型评估：根据身高、体重、性别返回 BMI、体型结论（偏瘦/正常/偏胖）、推荐尺码。
 * GET /api/body-profile/assess?height_cm=170&weight_kg=65&gender=女&merchant_id=1（可选）
 * 若传 merchant_id，则用该商家的尺码规则表计算推荐尺码；否则用默认身高+体型逻辑。
 */
bodyProfileRouter.get('/assess', (req, res) => {
  const height_cm = Number(req.query.height_cm);
  const weight_kg = Number(req.query.weight_kg);
  const gender = (req.query.gender as string) || '';
  const merchant_id = req.query.merchant_id ? Number(req.query.merchant_id) : null;
  if (!height_cm || height_cm < 100 || height_cm > 250 || !weight_kg || weight_kg < 30 || weight_kg > 200) {
    return res.status(400).json({ error: '请填写有效身高（100-250cm）和体重（30-200kg）' });
  }
  const height_m = height_cm / 100;
  const bmi = Math.round((weight_kg / (height_m * height_m)) * 10) / 10;
  let conclusion: '偏瘦' | '正常' | '偏胖' = '正常';
  if (bmi < 18.5) conclusion = '偏瘦';
  else if (bmi >= 24) conclusion = '偏胖';

  const sizes = ['S', 'M', 'L', 'XL', 'XXL'] as const;
  let recommendedSize: string;
  let sizeSource: 'merchant' | 'default' = 'default';

  if (merchant_id && (gender === '女' || gender === '男')) {
    const rule = db.prepare(
      `SELECT size FROM merchant_size_rules WHERE merchant_id = ? AND gender = ?
       AND ? >= height_min_cm AND ? <= height_max_cm AND ? >= weight_min_kg AND ? <= weight_max_kg LIMIT 1`
    ).get(merchant_id, gender, height_cm, height_cm, weight_kg, weight_kg) as { size: string } | undefined;
    if (rule && sizes.includes(rule.size as (typeof sizes)[number])) {
      recommendedSize = rule.size;
      sizeSource = 'merchant';
    } else {
      recommendedSize = defaultRecommendedSize(height_cm, gender, conclusion, sizes);
    }
  } else {
    recommendedSize = defaultRecommendedSize(height_cm, gender, conclusion, sizes);
  }

  res.json({ bmi, conclusion, recommendedSize, sizeSource });
});

function defaultRecommendedSize(
  height_cm: number,
  gender: string,
  conclusion: '偏瘦' | '正常' | '偏胖',
  sizes: readonly ['S', 'M', 'L', 'XL', 'XXL']
): string {
  const isFemale = gender === '女';
  const baseByHeight = isFemale
    ? height_cm < 155 ? 0 : height_cm < 160 ? 1 : height_cm < 165 ? 2 : height_cm < 170 ? 3 : 4
    : height_cm < 165 ? 0 : height_cm < 170 ? 1 : height_cm < 175 ? 2 : height_cm < 180 ? 3 : 4;
  let sizeIndex = baseByHeight;
  if (conclusion === '偏胖') sizeIndex = Math.min(sizeIndex + 1, sizes.length - 1);
  else if (conclusion === '偏瘦') sizeIndex = Math.max(sizeIndex - 2, 0);
  return sizes[sizeIndex];
}

bodyProfileRouter.get('/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const row = db.prepare('SELECT * FROM body_profiles WHERE user_id = ?').get(userId);
  if (!row) return res.status(404).json({ error: '未填写体型' });
  res.json(row);
});

bodyProfileRouter.put('/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const { gender, height_cm, weight_kg, body_type, extra_prompt } = req.body;
  const prompt_snippet = body_type ? BODY_PROMPT[body_type] || '' : '';
  db.prepare(`
    INSERT INTO body_profiles (user_id, gender, height_cm, weight_kg, body_type, prompt_snippet, extra_prompt, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      gender=excluded.gender,
      height_cm=excluded.height_cm,
      weight_kg=excluded.weight_kg,
      body_type=excluded.body_type,
      prompt_snippet=excluded.prompt_snippet,
      extra_prompt=excluded.extra_prompt,
      updated_at=datetime('now')
  `).run(userId, gender ?? null, height_cm ?? null, weight_kg ?? null, body_type ?? null, prompt_snippet, extra_prompt ?? null);
  const row = db.prepare('SELECT * FROM body_profiles WHERE user_id = ?').get(userId);
  res.json(row);
});
