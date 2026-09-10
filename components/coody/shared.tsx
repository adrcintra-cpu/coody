'use client';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { ArrowUpRight, FileText } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import {
  statusLabels,
  displayDate,
  type Content,
  type Brand,
  type Status,
} from '@/lib/types';
export function Picker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
      <SelectTrigger aria-label={label} className="picker">
        <SelectValue>
          {options.find((o) => o.value === value)?.label || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={'status status-' + status.replaceAll(' ', '-')}>
      <i />
      {statusLabels[status]}
    </span>
  );
}
export function BrandMark({ brand }: { brand?: Brand }) {
  return (
    <span className="brand-mark" style={{ color: brand?.colors.split(',')[0] }}>
      {brand?.name.slice(0, 1) || '?'}
    </span>
  );
}
export function NoData({
  title = 'Nada por aqui ainda',
  description = 'Comece criando o primeiro item.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <FileText size={25} />
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function ContentRow({
  item,
  brand,
  onOpen,
}: {
  item: Content;
  brand?: Brand;
  onOpen: () => void;
}) {
  return (
    <button className="content-row" onClick={onOpen}>
      <BrandMark brand={brand} />
      <span className="row-title">
        <strong>{item.title}</strong>
        <small>
          {brand?.name} <span>·</span> {item.format}
        </small>
      </span>
      <StatusBadge status={item.status} />
      <span className="row-date">{displayDate(item.date)}</span>
      <ArrowUpRight size={17} />
    </button>
  );
}
export function Meter({ value, label }: { value: number; label: string }) {
  return <Progress aria-label={label} value={Math.min(100, value)} />;
}
