import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

/**
 * Render a provider descriptor's credential + config fields as a controlled
 * form. `values` is a flat { key: value } map; `onChange(key, value)` updates it.
 * Secret fields render as password inputs; a `field_map` field renders as a JSON
 * textarea.
 */
export default function ProviderFields({ provider, values, onChange }) {
  if (!provider) return null;
  const fields = [
    ...(provider.credentialFields || []).map((f) => ({ ...f, secret: true })),
    ...(provider.configFields || []),
  ];
  if (fields.length === 0) {
    return <p className="text-xs text-muted-foreground">No additional fields required.</p>;
  }

  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key}>
          <Label className="text-xs">
            {f.label}
            {f.required && <span className="text-red-500 ltr:ml-0.5 rtl:mr-0.5">*</span>}
          </Label>
          {f.key === 'field_map' ? (
            <Textarea
              rows={4}
              className="font-mono text-xs"
              placeholder={'{"external_id":"id","full_name":"name"}'}
              value={values[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : (
            <Input
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={f.placeholder || ''}
              value={values[f.key] || ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
