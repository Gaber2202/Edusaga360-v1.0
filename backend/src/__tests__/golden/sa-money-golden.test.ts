/**
 * Golden-file tests for Saudi Riyal (SAR) formatting and halala conversion.
 *
 * `sar()`, `toHalala()` and `toSar()` are used by payroll, billing, and ZATCA
 * totals. The snapshots pin rounding and subunit conversion behaviour.
 */
import { describe, it } from 'vitest';
import { sar, toHalala, toSar } from '../../lib/money.js';
import { golden } from './support/golden.js';

describe('SAR money formatting golden snapshots', () => {
  it('sar() rounding is stable', () => {
    const cases = [
      sar(1234.5678),
      sar(100.5),
      sar(0.005),
      sar(-10.999),
      sar(0),
      sar(115),
      sar(1150),
    ];
    golden('sa-money-sar-rounding', JSON.stringify(cases), 'json');
  });

  it('toHalala conversion is stable', () => {
    const cases = [
      toHalala(1234.56),
      toHalala(115),
      toHalala(0.01),
      toHalala(null),
      toHalala('1150'),
      toHalala(0),
    ];
    golden('sa-money-to-halala', JSON.stringify(cases), 'json');
  });

  it('toSar conversion is stable', () => {
    const cases = [
      toSar(115000),
      toSar(1150),
      toSar(10),
      toSar(null),
      toSar('100000'),
      toSar(0),
    ];
    golden('sa-money-to-sar', JSON.stringify(cases), 'json');
  });
});
