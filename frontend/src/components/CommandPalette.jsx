import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './ui/command';
import { useLanguage } from './LanguageContext';
import { createPageUrl } from '../utils';
import { flattenNavigationForCommandPalette } from '../lib/staffNavigation';

export default function CommandPalette({ open, onOpenChange, navigation = [] }) {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();

  const navGroups = useMemo(
    () => flattenNavigationForCommandPalette(navigation, t),
    [navigation, t],
  );

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange?.((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange]);

  function handleSelect(page) {
    onOpenChange?.(false);
    requestAnimationFrame(() => navigate(createPageUrl(page)));
  }

  const shortcutHint = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
    ? (isRTL ? 'Esc للإغلاق · ⌘K للبحث' : 'Esc to close · ⌘K to search')
    : (isRTL ? 'Esc للإغلاق · Ctrl+K للبحث' : 'Esc to close · Ctrl+K to search');

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={isRTL ? 'ابحث عن صفحة...' : 'Search pages...'} />
      <CommandList>
        <CommandEmpty>{isRTL ? 'لا توجد نتائج.' : 'No results found.'}</CommandEmpty>
        {navGroups.map(({ group, items }) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.page}
                  value={item.searchValue}
                  onSelect={() => handleSelect(item.page)}
                >
                  {Icon && <Icon />}
                  <span>{item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      <p className="text-xs text-muted-foreground px-3 pb-2">{shortcutHint}</p>
    </CommandDialog>
  );
}

export { CommandPalette };
