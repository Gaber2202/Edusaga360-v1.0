import * as React from 'react';
import { cn } from '../../lib/utils';

function MessageGroup({ className, ...props }) {
  return (
    <div
      data-slot="message-group"
      className={cn('flex min-w-0 flex-col gap-3', className)}
      {...props}
    />
  );
}

function Message({ className, align = 'start', ...props }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        'group/message relative flex w-full min-w-0 gap-3 data-[align=end]:flex-row-reverse',
        className,
      )}
      {...props}
    />
  );
}

function MessageAvatar({ className, ...props }) {
  return (
    <div
      data-slot="message-avatar"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center self-start overflow-hidden rounded-full bg-forest-100 text-forest-700',
        className,
      )}
      {...props}
    />
  );
}

function MessageContent({ className, ...props }) {
  return (
    <div
      data-slot="message-content"
      className={cn('flex min-w-0 flex-1 flex-col gap-1', className)}
      {...props}
    />
  );
}

function MessageHeader({ className, ...props }) {
  return (
    <div
      data-slot="message-header"
      className={cn('flex max-w-full min-w-0 items-center gap-2', className)}
      {...props}
    />
  );
}

function MessageFooter({ className, ...props }) {
  return (
    <div
      data-slot="message-footer"
      className={cn(
        'flex max-w-full min-w-0 items-center text-[13px] text-muted-foreground group-data-[align=end]/message:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export { MessageGroup, Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader };
