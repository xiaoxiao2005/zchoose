import { Link } from 'react-router-dom';
import { imageDisplayUrl } from '../utils/imageDisplayUrl';
import './OutfitCard.css';

function simplifyOutfitName(name: string): string {
  const n = (name || '').trim();
  if (!n) return '未命名搭配';
  const cleaned = n
    .replace(/去除图片左侧鞋子/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[-_][a-z0-9]{10,}$/i, '')
    .trim();

  // 女款统一格式：例如「职场通勤-女-18-24-5」->「职场通勤-女-18-24-05」
  const femaleWithSeq = cleaned.match(/^(.+)-女-(\d{1,2}(?:-\d{1,2}|\+)?)-(\d+)$/);
  if (femaleWithSeq) return `${femaleWithSeq[1]}-女-${femaleWithSeq[2]}-${femaleWithSeq[3].padStart(2, '0')}`;

  // 通用前缀裁剪，避免卡片标题过长
  return cleaned
    .replace(/^职场通勤-/, '')
    .replace(/^约会社交-/, '')
    .replace(/^节日家庭-/, '')
    .replace(/^日常休闲-/, '')
    .replace(/^运动出行-/, '');
}

interface MerchantSlot {
  slot: string;
  merchant_id: number;
  merchant_name?: string;
  product_url?: string;
  product_title?: string;
}

interface Outfit {
  id: number;
  name: string;
  image_url?: string | null;
  style_tags?: string | null;
  need_points?: number;
  unlocked?: boolean;
  liked?: boolean;
  merchant_slots?: MerchantSlot[];
}

interface Props {
  outfit: Outfit;
  showUnlock?: boolean;
  onUnlock?: (outfitId: number) => void;
  onLike?: (outfitId: number) => void;
  onTryClick?: (outfitId: number) => void;
  onImageClick?: (imageUrl: string, name: string) => void;
  unlocking?: number | null;
  imagePriority?: boolean;
}

export default function OutfitCard({
  outfit,
  showUnlock = true,
  onUnlock,
  onLike,
  onTryClick,
  onImageClick,
  unlocking,
  imagePriority = false,
}: Props) {
  const displayName = simplifyOutfitName(outfit.name);
  const needPoints = outfit.need_points ?? 0;
  const unlocked = outfit.unlocked ?? false;
  const liked = outfit.liked ?? false;
  const canTryOn = needPoints === 0 || unlocked;

  const tryLink = (
    <Link
      to={`/tryon?outfitId=${outfit.id}`}
      className="outfit-card__btn"
      onClick={() => onTryClick?.(outfit.id)}
    >
      去试穿
    </Link>
  );

  return (
    <div className="outfit-card">
      <div
        className={`outfit-card__img${onImageClick && outfit.image_url ? ' outfit-card__img--clickable' : ''}`}
        role={onImageClick && outfit.image_url ? 'button' : undefined}
        tabIndex={onImageClick && outfit.image_url ? 0 : undefined}
        onClick={(e) => {
          if (onImageClick && outfit.image_url) {
            e.preventDefault();
            e.stopPropagation();
            onImageClick(imageDisplayUrl(outfit.image_url!), displayName);
          }
        }}
        onKeyDown={(e) => {
          if (onImageClick && outfit.image_url && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            onImageClick(imageDisplayUrl(outfit.image_url!), displayName);
          }
        }}
      >
        {outfit.image_url ? (
          <img
            className="outfit-card__img-el"
            src={imageDisplayUrl(outfit.image_url)}
            alt={displayName}
            loading={imagePriority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={imagePriority ? 'high' : 'auto'}
            draggable={false}
          />
        ) : null}
        {onLike != null && (
          <button
            type="button"
            className={`outfit-card__like ${liked ? 'outfit-card__like--active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLike(outfit.id);
            }}
            title={liked ? '取消喜欢' : '喜欢'}
            aria-label={liked ? '取消喜欢' : '喜欢'}
          >
            {liked ? '❤' : '🤍'}
          </button>
        )}
      </div>
      <div className="outfit-card__info">
        <div className="outfit-card__name">{displayName}</div>
        {showUnlock && needPoints > 0 && !unlocked && (
          <div className="outfit-card__need">需 {needPoints} 积分</div>
        )}
        <div className="outfit-card__merchant-slots">
          <span className="outfit-card__merchant-label">商家入驻 · 可购：</span>
          {outfit.merchant_slots && outfit.merchant_slots.length > 0 ? (
            <>
              {outfit.merchant_slots.map((s) =>
                s.product_url ? (
                  <a
                    key={s.slot}
                    href={s.product_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="outfit-card__merchant-link"
                  >
                    {s.slot}
                  </a>
                ) : (
                  <span key={s.slot} className="outfit-card__merchant-slot">{s.slot}</span>
                )
              )}
            </>
          ) : (
            <span className="outfit-card__merchant-empty">暂无（上衣/裤子/鞋子/配饰可入驻）</span>
          )}
        </div>
      </div>
      {canTryOn ? (
        tryLink
      ) : showUnlock && onUnlock ? (
        <button
          type="button"
          className="outfit-card__btn outfit-card__btn--unlock"
          onClick={() => onUnlock(outfit.id)}
          disabled={unlocking === outfit.id}
        >
          {unlocking === outfit.id ? '解锁中...' : '积分解锁'}
        </button>
      ) : null}
    </div>
  );
}
