import { useEffect, useState } from "react";
import { DISPLAY_CURRENCIES } from "../lib/fx.constants";

const STORAGE_KEY = "ppa-reporting-currency";

export function useDisplayCurrency() {
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DISPLAY_CURRENCIES.includes(saved as (typeof DISPLAY_CURRENCIES)[number])) {
        setCurrency(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const updateCurrency = (next: string) => {
    setCurrency(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return [currency, updateCurrency] as const;
}

export function RevenueCurrencySelector({
  value,
  onChange,
  fxAsOf,
}: {
  value: string;
  onChange: (currency: string) => void;
  fxAsOf?: string;
}) {
  return (
    <s-stack direction="inline" gap="base" alignItems="center">
      <s-select
        label="Display currency"
        value={value}
        onChange={(e: Event) => {
          const target = e.currentTarget as HTMLSelectElement;
          onChange(target.value);
        }}
      >
        {DISPLAY_CURRENCIES.map((code) => (
          <s-option key={code} value={code}>
            {code}
          </s-option>
        ))}
      </s-select>
      {fxAsOf ? (
        <s-text tone="neutral" color="subdued">
          FX rates as of {fxAsOf}
        </s-text>
      ) : null}
    </s-stack>
  );
}
