"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WalletProvider } from "@/lib/wallet";
import { ToastProvider } from "@/lib/tx";
import { Toasts } from "./ui";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 4000, refetchOnWindowFocus: true, retry: 1 } } }));
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <WalletProvider>
          {children}
          <Toasts />
        </WalletProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
