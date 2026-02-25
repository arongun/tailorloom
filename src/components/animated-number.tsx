"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}

export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 800,
}: AnimatedNumberProps) {
  // Initialize display to the actual value so mount/tab-switch shows instantly
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const hasMounted = useRef(false);
  const animationFrame = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    // Skip animation on first mount — just show the value
    if (!hasMounted.current) {
      hasMounted.current = true;
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }

    // On subsequent value changes, animate the transition
    const from = previousValue.current;
    const to = value;

    // No animation needed if value hasn't changed
    if (from === to) return;

    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = to;
      }
    };

    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [value, duration]);

  const formatted = displayValue.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
