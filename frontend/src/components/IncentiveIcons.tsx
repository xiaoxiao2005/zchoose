import './IncentiveIcons.css';

/** 时尚能量：闪电/能量图标 */
export function IconEnergy({ className }: { className?: string }) {
  return (
    <span className={`incentive-icon incentive-icon--energy ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    </span>
  );
}

/** 累计登录：火焰/ streak 图标 */
export function IconStreak({ className }: { className?: string }) {
  return (
    <span className={`incentive-icon incentive-icon--streak ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    </span>
  );
}

/** 积分：星星/硬币图标 */
export function IconPoints({ className }: { className?: string }) {
  return (
    <span className={`incentive-icon incentive-icon--points ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </span>
  );
}
