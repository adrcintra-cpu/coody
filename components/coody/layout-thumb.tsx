import type { ReactElement } from 'react';
import type { Layout } from './art-layouts';

/** Miniatura esquemática de cada modelo (para escolher pelo desenho, não pelo nome). */
export function LayoutThumb({ layout, on }: { layout: Layout; on: boolean }) {
  const c = on ? '#4700ff' : '#9aa0ad';
  const soft = on ? '#d9ccff' : '#dfe2e8';
  const ink = on ? '#2a0f99' : '#6b7180';
  const t = (x: number, y: number, w: number, h = 3) => <rect x={x} y={y} width={w} height={h} rx={1.5} fill={ink} />;
  const body = (x: number, y: number, w: number) => <rect x={x} y={y} width={w} height={2} rx={1} fill={soft === '#dfe2e8' ? '#b9bec9' : '#a48cff'} />;
  const obj = (cx: number, cy: number, r: number) => (
    <g>
      <ellipse cx={cx} cy={cy + r * 0.95} rx={r * 0.9} ry={r * 0.18} fill="#0f154022" />
      <circle cx={cx} cy={cy} r={r} fill={c} />
      <circle cx={cx - r * 0.35} cy={cy - r * 0.35} r={r * 0.28} fill="#ffffff88" />
    </g>
  );
  const shapes: Record<Layout, ReactElement> = {
    recorte: (
      <>
        {t(12, 7, 24)}
        {t(15, 12, 18)}
        <path d="M14 22h20v26l-10-5-10 5z" fill={soft} />
        {obj(24, 33, 9)}
      </>
    ),
    vidro: (
      <>
        <rect x={4} y={8} width={30} height={48} rx={4} fill="#ffffff" stroke={soft} />
        <rect x={8} y={12} width={10} height={4} rx={2} fill={c} />
        {t(8, 20, 18)}
        {t(8, 25, 14)}
        {body(8, 33, 14)}
        {body(8, 37, 12)}
        {obj(36, 34, 10)}
      </>
    ),
    gigante: (
      <>
        {t(12, 6, 24, 2.5)}
        <text x={24} y={50} textAnchor="middle" fontSize={40} fontWeight={900} fill={soft} fontFamily="Arial">3</text>
        {obj(27, 38, 8)}
      </>
    ),
    poster: (
      <>
        <circle cx={10} cy={30} r={10} fill={soft} opacity={0.7} />
        <circle cx={40} cy={34} r={10} fill={soft} opacity={0.7} />
        {obj(24, 17, 8)}
        <rect x={23.5} y={27} width={1} height={10} fill={ink} />
        {t(12, 41, 24)}
        {t(15, 46, 18)}
      </>
    ),
    manchete: (
      <>
        <rect x={0} y={0} width={48} height={60} fill={c} />
        {t(6, 26, 30, 5)}
        {t(6, 33, 22, 5)}
        <rect x={28} y={33} width={12} height={5} rx={1.5} fill="#ffffffaa" />
        {body(6, 44, 26)}
      </>
    ),
    editorial: (
      <>
        <rect x={0} y={0} width={48} height={33} fill={soft} />
        <path d="M0 33l14-12 10 8 9-6 15 10z" fill="#b9bec9" />
        <rect x={0} y={33} width={48} height={27} fill={c} />
        {t(6, 39, 28, 4)}
        {body(6, 48, 24)}
      </>
    ),
    moldura: (
      <>
        <rect x={6} y={8} width={36} height={26} rx={4} fill={soft} />
        {t(6, 40, 28, 4)}
        {body(6, 48, 22)}
      </>
    ),
    faixa: (
      <>
        <rect x={0} y={0} width={48} height={60} fill={soft} />
        <rect x={0} y={30} width={40} height={20} fill={c} />
        {t(5, 35, 26, 4)}
        {body(5, 43, 22)}
      </>
    ),
    foto: (
      <>
        <rect x={0} y={0} width={48} height={60} fill={soft} />
        <rect x={0} y={34} width={48} height={26} fill="#0f154055" />
        {t(5, 40, 30, 4)}
        {body(5, 49, 24)}
      </>
    ),
    numero: (
      <>
        <text x={5} y={34} fontSize={26} fontWeight={900} fill={c} fontFamily="Arial">20%</text>
        {t(6, 40, 26, 4)}
        {body(6, 48, 22)}
      </>
    ),
    lista: (
      <>
        {t(6, 8, 26, 4)}
        {[20, 30, 40].map((y, i) => (
          <g key={y}>
            <rect x={6} y={y - 3} width={36} height={0.8} fill="#b9bec9" />
            <text x={6} y={y + 4} fontSize={6} fontWeight={800} fill={c} fontFamily="Arial">{`0${i + 1}`}</text>
            {body(16, y + 1, 20)}
          </g>
        ))}
      </>
    ),
    citacao: (
      <>
        <text x={5} y={26} fontSize={26} fontWeight={900} fill={c} fontFamily="Georgia">“</text>
        {t(6, 28, 30, 3.5)}
        {t(6, 34, 24, 3.5)}
        {body(6, 44, 16)}
      </>
    ),
  };
  return (
    <svg viewBox="0 0 48 60" className="block h-full w-full" aria-hidden>
      <rect x={0} y={0} width={48} height={60} fill="#f6f4ef" />
      {shapes[layout]}
    </svg>
  );
}
