'use client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from './forms';
import { Picker } from './shared';
import { assetCategories } from '@/lib/brand-memory';
export type AssetFieldsValue = {
  name: string;
  category: string;
  description: string;
  aiNotes: string;
  priority: boolean;
};
export const emptyAssetFields: AssetFieldsValue = {
  name: '',
  category: 'visual_reference',
  description: '',
  aiNotes: '',
  priority: false,
};
export function AssetFields({
  value,
  onChange,
  prefix = 'asset',
}: {
  value: AssetFieldsValue;
  onChange: (v: AssetFieldsValue) => void;
  prefix?: string;
}) {
  return (
    <>
      <div className="form-grid">
        <Field label="Nome">
          <Input
            required
            maxLength={200}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </Field>
        <Field label="Categoria">
          <Picker
            label="Categoria do arquivo"
            value={value.category}
            onChange={(v) => onChange({ ...value, category: v })}
            options={[...assetCategories]}
          />
        </Field>
      </div>
      <Field label="Descrição">
        <Textarea
          rows={2}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </Field>
      <Field label="Observação para IA">
        <Textarea
          rows={2}
          value={value.aiNotes}
          onChange={(e) => onChange({ ...value, aiNotes: e.target.value })}
          placeholder="O que preservar, observar ou evitar ao usar este arquivo?"
        />
      </Field>
      <label htmlFor={prefix + '-priority'} className="check-label">
        <Checkbox
          id={prefix + '-priority'}
          checked={value.priority}
          onCheckedChange={(v) => onChange({ ...value, priority: !!v })}
        />{' '}
        Referência prioritária
      </label>
    </>
  );
}
