// Money helpers: centralize SAR/Halala conversion so no inline math drifts.
export const SAR_TO_HALALA = 100;

export function toHalala(sar: number | string | null | undefined): number {
  if (sar === null || sar === undefined) return 0;
  const num = typeof sar === 'string' ? parseFloat(sar) : sar;
  if (Number.isNaN(num)) return 0;
  return Math.round(num * SAR_TO_HALALA);
}

export function toSar(halala: number | string | null | undefined): number {
  if (halala === null || halala === undefined) return 0;
  const num = typeof halala === 'string' ? parseFloat(halala) : halala;
  if (Number.isNaN(num)) return 0;
  return Math.round(num) / SAR_TO_HALALA;
}

export function sar(num: number): number {
  return Math.round(num * SAR_TO_HALALA) / SAR_TO_HALALA;
}
