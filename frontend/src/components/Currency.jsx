import { useTenant } from './TenantContext';
import { useLanguage } from './LanguageContext';
import { formatCurrency } from '../lib/localization';

export default function Currency({ amount, forceLocale }) {
  const { tenant } = useTenant();
  const { isRTL } = useLanguage();
  const rtl = forceLocale === 'ar' ? true : forceLocale === 'en' ? false : isRTL;
  return formatCurrency(amount, tenant?.localization, rtl);
}
