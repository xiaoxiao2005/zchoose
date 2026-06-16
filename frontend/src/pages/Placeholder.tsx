import type { PropsWithChildren } from 'react';
import './Placeholder.css';

type Props = PropsWithChildren<{ title: string }>;

export default function Placeholder({ title, children }: Props) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      {children ?? <p>该页面后续实现。</p>}
    </div>
  );
}
