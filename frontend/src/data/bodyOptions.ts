/**
 * 体型选项默认数据，与后端 bodyProfile 一致。
 * 当 /api/body-profile/options 请求失败或返回异常时，前端仍能显示体型选择。
 */
export interface BodyOption {
  value: string;
  label: string;
  imageUrl: string;
}

export interface BodyOptionsByGender {
  female: BodyOption[];
  male: BodyOption[];
}

const DEFAULT_FEMALE: BodyOption[] = [
  { value: 'pear', label: '梨型', imageUrl: '/images/body-ref/female/pear.svg' },
  { value: 'inv_triangle_f', label: '倒三角型', imageUrl: '/images/body-ref/female/inv_triangle.svg' },
  { value: 'hourglass', label: '沙漏型', imageUrl: '/images/body-ref/female/hourglass.svg' },
  { value: 'h_type', label: 'H型', imageUrl: '/images/body-ref/female/h_type.svg' },
  { value: 'apple', label: '苹果型', imageUrl: '/images/body-ref/female/apple.svg' },
];

const DEFAULT_MALE: BodyOption[] = [
  { value: 'o_type', label: 'O型', imageUrl: '/images/body-ref/male/o_type.svg' },
  { value: 'triangle', label: '正三角型', imageUrl: '/images/body-ref/male/triangle.svg' },
  { value: 'rectangle', label: '矩形', imageUrl: '/images/body-ref/male/rectangle.svg' },
  { value: 'inv_triangle_m', label: '倒三角型', imageUrl: '/images/body-ref/male/inv_triangle.svg' },
  { value: 'inv_trapezoid', label: '倒梯型', imageUrl: '/images/body-ref/male/inv_trapezoid.svg' },
];

export const DEFAULT_BODY_OPTIONS: BodyOptionsByGender = {
  female: DEFAULT_FEMALE,
  male: DEFAULT_MALE,
};
