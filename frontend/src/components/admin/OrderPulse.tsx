"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { adminApi, type OrderPulse } from "@/lib/admin-api";

const POLL_MS = 20_000;

type PulseValue = { pulse: OrderPulse | null; refresh: () => Promise<void> };

const PulseContext = createContext<PulseValue>({ pulse: null, refresh: async () => {} });

export function useOrderPulse(): PulseValue {
  return useContext(PulseContext);
}

// Asks the server every 20 seconds for the newest order and the order counts, once for the whole
// admin page; the bell, the sound alerts and the day tabs all read from here.
export function OrderPulseProvider({ children }: { children: ReactNode }) {
  const [pulse, setPulse] = useState<OrderPulse | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPulse(await adminApi.latestOrder());
    } catch {
      // Signed out or offline: the page itself handles that; try again next round.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return <PulseContext.Provider value={{ pulse, refresh }}>{children}</PulseContext.Provider>;
}

// Asks the orders page to open one order (used by the bell's list).
export const OPEN_ORDER_EVENT = "chuvachi:open-order";

export function requestOpenOrder(code: string) {
  window.dispatchEvent(new CustomEvent<string>(OPEN_ORDER_EVENT, { detail: code }));
}
