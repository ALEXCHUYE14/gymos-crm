'use client';

import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{ classNames: { toast: 'font-sans' } }}
      />
    </ThemeProvider>
  );
}
