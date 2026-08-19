import * as React from 'react';
import { cn } from '../../lib/utils';
import { Label } from './label';

function Field({ className, ...props }) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

function FieldLabel({ className, ...props }) {
  return <Label className={cn('text-[13px] font-medium text-ink', className)} {...props} />;
}

function FieldGroup({ className, ...props }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)} {...props} />;
}

function FieldSet({ className, ...props }) {
  return <fieldset className={cn('min-w-0 space-y-3', className)} {...props} />;
}

function FieldLegend({ className, ...props }) {
  return (
    <legend
      className={cn('px-0 text-[13px] font-medium text-ink', className)}
      {...props}
    />
  );
}

export { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend };
