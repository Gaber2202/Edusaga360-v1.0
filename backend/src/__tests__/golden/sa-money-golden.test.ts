/**
 * Golden-file tests for Saudi Riyal (SAR) formatting and minor/major unit
 * conversion.
 *
 * `roundToMinorUnits(amount, 2)` is the jurisdiction-agnostic SAR rounding.
 * `toMinorUnits()` and `toMajorUnits()` are the jurisdiction-agnostic helpers;
 * the snapshots pin the same rounding and subunit conversion behaviour.
 */
import { describe, it } from 'vitest';
import { roundToMinorUnits, toMinorUnits, toMajorUnits } from '../../lib/money.js';
import { golden } from './support/golden.js';

const MINOR_UNITS = 2;

describe('SAR money formatting golden snapshots', () => {
  it('roundToMinorUnits(amount, 2) rounding is stable', () => {
    const cases = [
      roundToMinorUnits(1234.5678, MINOR_UNITS),
      roundToMinorUnits(100.5, MINOR_UNITS),
      roundToMinorUnits(0.005, MINOR_UNITS),
      roundToMinorUnits(-10.999, MINOR_UNITS),
      roundToMinorUnits(0, MINOR_UNITS),
      roundToMinorUnits(115, MINOR_UNITS),
      roundToMinorUnits(1150, MINOR_UNITS),
    ];
    golden('sa-money-sar-rounding', JSON.stringify(cases), 'json');
  });

  it('toMinorUnits conversion is stable', () => {
    const cases = [
      toMinorUnits(1234.56, MINOR_UNITS),
      toMinorUnits(115, MINOR_UNITS),
      toMinorUnits(0.01, MINOR_UNITS),
      toMinorUnits(null, MINOR_UNITS),
      toMinorUnits('1150', MINOR_UNITS),
      toMinorUnits(0, MINOR_UNITS),
    ];
    golden('sa-money-to-minor-units', JSON.stringify(cases), 'json');
  });

  it('toMajorUnits conversion is stable', () => {
    const cases = [
      toMajorUnits(115000, MINOR_UNITS),
      toMajorUnits(1150, MINOR_UNITS),
      toMajorUnits(10, MINOR_UNITS),
      toMajorUnits(null, MINOR_UNITS),
      toMajorUnits('100000', MINOR_UNITS),
      toMajorUnits(0, MINOR_UNITS),
    ];
    golden('sa-money-to-major-units', JSON.stringify(cases), 'json');
  });
});
