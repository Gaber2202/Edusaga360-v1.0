/**
 * src/packs/sa/index.ts
 *
 * Saudi Arabia (KSA) country pack scaffolding.
 *
 * This module will contain all Saudi-specific logic (ZATCA, Moyasar, Nafath,
 * GOSI, Qiwa, Mudad, Muqeem, Nitaqat, Hijri calendar, Saudi academic calendar,
 * SAR formatting, Arabic-SA document templates). For Step 2 it is intentionally
 * empty; logic is moved module-by-module in later steps.
 */

import type { CountryPack } from '../contract/CountryPack.js';

export const saPack: CountryPack = {
  code: 'SA',
};

export default saPack;
