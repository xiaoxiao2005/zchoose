import './TryOnPersonalInfoConsent.css';

/** 试衣相关个人信息同意（本地记录，便于同一设备重复试衣无需反复勾选；撤回同意可取消勾选） */
export const TRYON_PERSONAL_INFO_CONSENT_KEY = 'zchoose_pi_consent_tryon_v1';

export function readTryonPersonalInfoConsent(): boolean {
  try {
    return localStorage.getItem(TRYON_PERSONAL_INFO_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeTryonPersonalInfoConsent(agreed: boolean): void {
  try {
    if (agreed) localStorage.setItem(TRYON_PERSONAL_INFO_CONSENT_KEY, '1');
    else localStorage.removeItem(TRYON_PERSONAL_INFO_CONSENT_KEY);
  } catch {
    /* ignore */
  }
}

type Props = {
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
};

/**
 * 《个人信息保护法》第十三条等：处理敏感个人信息应取得个人的单独同意。
 * 试衣人像照、身高体重及体型等属生物识别/健康相关或高度关联信息，单独告知并勾选同意。
 */
export default function TryOnPersonalInfoConsent({ agreed, onAgreedChange }: Props) {
  return (
    <section className="pi-consent">
      <label className="pi-consent__label">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => {
            const v = e.target.checked;
            onAgreedChange(v);
            writeTryonPersonalInfoConsent(v);
          }}
        />
        <span>我已阅读并同意</span>
      </label>
    </section>
  );
}
