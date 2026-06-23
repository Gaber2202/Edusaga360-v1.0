import { describe, it, expect } from 'vitest';
import { planLabel, trialDaysLeft, formatMoney, PLAN_BY_CODE } from '../lib/plans';

describe('planLabel', () => {
  it('returns the known label for a plan code', () => {
    expect(planLabel('enterprise')).toBe('Enterprise');
    expect(planLabel('free_trial')).toBe('Free Trial');
  });
  it('falls back to the raw code when unknown', () => {
    expect(planLabel('custom_code')).toBe('custom_code');
  });
  it('falls back to "trial" when no code is given', () => {
    expect(planLabel(undefined)).toBe('trial');
    expect(planLabel(null)).toBe('trial');
  });
});

describe('trialDaysLeft', () => {
  it('returns null when no date is given', () => {
    expect(trialDaysLeft(null)).toBeNull();
    expect(trialDaysLeft(undefined)).toBeNull();
  });
  it('returns a positive count for a future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(trialDaysLeft(future.toISOString())).toBe(5);
  });
  it('returns a negative count for a past date', () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    expect(trialDaysLeft(past.toISOString())).toBe(-3);
  });
  it('returns 0 for today', () => {
    expect(trialDaysLeft(new Date().toISOString())).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats a whole number with the default SAR currency', () => {
    expect(formatMoney(1499)).toBe('1,499 SAR');
  });
  it('supports a custom currency', () => {
    expect(formatMoney(100, 'USD')).toBe('100 USD');
  });
  it('treats missing/invalid amounts as 0', () => {
    expect(formatMoney(undefined)).toBe('0 SAR');
    expect(formatMoney(null)).toBe('0 SAR');
    expect(formatMoney('not-a-number')).toBe('0 SAR');
  });
});

describe('PLAN_BY_CODE', () => {
  it('indexes every plan by its code', () => {
    expect(PLAN_BY_CODE.enterprise.name).toBe('Enterprise');
    expect(PLAN_BY_CODE.starter.max_users).toBe(10);
  });
});
