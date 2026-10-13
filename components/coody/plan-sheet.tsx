'use client';
import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { planApprovalOf, planDay, planText } from '@/lib/domain';
import { planApprovalLabels, statusLabels, type Status } from '@/lib/types';

export type PlanSheetItem = {
  id: string;
  date: string;
  title: string;
  format: string;
  brief?: string;
  pillar?: string;
  status: Status;
};
export type PlanSheetPlan = {
  campaign?: string;
  approval?: string | null;
  approvalNote?: string;
  approvedAt?: string | null;
  approvedBy?: string;
} | null;

/**
 * The month plan as a text: each date and what goes out. Shared by the team
 * (Planejamento) and the client link; `actions` holds the buttons of each side.
 */
export function PlanSheet({
  brand,
  month,
  items,
  plan,
  onOpen,
  actions,
}: {
  brand: string;
  month: string;
  items: PlanSheetItem[];
  plan: PlanSheetPlan;
  onOpen?: (id: string) => void;
  actions?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const approval = plan ? planApprovalOf(plan) : null;
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(planText(brand, month, sorted, plan?.campaign || ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the text is on screen */
    }
  };
  return (
    <section className="panel plan-sheet">
      <div className="plan-sheet-head">
        {approval && <span className={'plan-approval ' + approval}>{planApprovalLabels[approval]}</span>}
        <button type="button" className="outline-btn" onClick={() => void copy()} disabled={!sorted.length}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar texto'}
        </button>
      </div>
      {approval === 'aprovado' && plan?.approvedBy && (
        <p className="form-hint">
          Aprovado por {plan.approvedBy}
          {plan.approvedAt ? ' em ' + new Date(plan.approvedAt).toLocaleDateString('pt-BR') : ''}. As datas
          estão confirmadas.
        </p>
      )}
      {approval === 'ajustes' && plan?.approvalNote && (
        <div className="notice plan-note">
          <strong>Mudanças pedidas pelo cliente</strong>
          <p>{plan.approvalNote}</p>
        </div>
      )}
      {plan?.campaign?.trim() && (
        <p className="plan-focus">
          <strong>Foco do mês:</strong> {plan.campaign}
        </p>
      )}
      <ol className="plan-lines">
        {sorted.map((i) => {
          const body = (
            <>
              <span className="plan-day">{planDay(i.date)}</span>
              <span className="plan-what">
                <small>
                  {i.format}
                  {i.pillar ? ' · ' + i.pillar : ''}
                </small>
                <strong>{i.title}</strong>
                {i.brief && <span className="plan-brief">{i.brief}</span>}
              </span>
              {!['IDEIA', 'PLANEJADO'].includes(i.status) && <em>{statusLabels[i.status]}</em>}
            </>
          );
          return (
            <li key={i.id}>
              {onOpen ? (
                <button type="button" onClick={() => onOpen(i.id)}>
                  {body}
                </button>
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {!sorted.length && <p className="muted">Nenhuma publicação planejada neste mês.</p>}
      {actions}
    </section>
  );
}
