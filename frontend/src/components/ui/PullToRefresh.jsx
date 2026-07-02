import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Wraps the scrolling content region and adds a native-feeling pull-to-refresh
 * gesture on touch devices: when the user drags down while already at the top,
 * a spinner is revealed and `onRefresh` runs on release. This component IS the
 * scroll container, so pass the scroll/padding classes via `className`.
 *
 * Mouse users are unaffected (touch handlers only) — the region just scrolls.
 */
const THRESHOLD = 70; // px of pull needed to trigger a refresh
const MAX_PULL = 90;

export default function PullToRefresh({ onRefresh, className, children, disabled }) {
  const scrollerRef = useRef(null);
  const startY = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (e) => {
    if (disabled || refreshing) return;
    // Only arm the gesture when the content is scrolled to the very top.
    startY.current = scrollerRef.current && scrollerRef.current.scrollTop <= 0
      ? e.touches[0].clientY
      : null;
  };

  const onTouchMove = (e) => {
    if (startY.current == null || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && scrollerRef.current.scrollTop <= 0) {
      // Resistance: content follows the finger at half speed, capped.
      setPull(Math.min(dy * 0.5, MAX_PULL));
    } else {
      setPull(0);
    }
  };

  const onTouchEnd = async () => {
    if (startY.current == null) return;
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPull(THRESHOLD * 0.6);
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
    startY.current = null;
  };

  return (
    <div
      ref={scrollerRef}
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator — height animates with the drag, collapses to 0 at rest */}
      <div
        className="flex items-end justify-center overflow-hidden"
        style={{ height: pull, transition: startY.current == null ? 'height 0.2s ease' : 'none' }}
        aria-hidden={pull === 0}
      >
        {(pull > 0 || refreshing) && (
          <RefreshCw
            className={`w-5 h-5 mb-2 text-najdi-700 ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
