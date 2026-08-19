import { Toaster as Sonner } from 'sonner';

const Toaster = ({ ...props }) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-ink group-[.toaster]:border-[color:var(--es-border)] group-[.toaster]:shadow-panel',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-sand-alt group-[.toast]:text-ink',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
