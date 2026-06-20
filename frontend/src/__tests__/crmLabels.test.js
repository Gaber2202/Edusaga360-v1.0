import { describe, it, expect } from 'vitest';
import {
  ticketStatusLabel, priorityLabel, slaLabel, segmentLabel, crmCategoryLabel,
} from '../lib/crmLabels';

describe('CRM bilingual labels (P3.5)', () => {
  it('localizes ticket status', () => {
    expect(ticketStatusLabel('in_progress', false)).toBe('In Progress');
    expect(ticketStatusLabel('in_progress', true)).toBe('قيد المعالجة');
  });
  it('localizes priority', () => {
    expect(priorityLabel('critical', false)).toBe('Critical');
    expect(priorityLabel('critical', true)).toBe('حرجة');
  });
  it('localizes SLA status', () => {
    expect(slaLabel('breached', false)).toBe('Breached');
    expect(slaLabel('breached', true)).toBe('متجاوزة');
  });
  it('localizes customer segment', () => {
    expect(segmentLabel('vip', true)).toBe('مميّز');
    expect(segmentLabel('active', false)).toBe('Active');
  });
  it('localizes category', () => {
    expect(crmCategoryLabel('financial', true)).toBe('مالي');
  });
  it('falls back to the raw key for unknown values', () => {
    expect(ticketStatusLabel('weird', false)).toBe('weird');
    expect(segmentLabel(undefined, false)).toBe('-');
  });
});
