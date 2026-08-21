import React from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ToastProvider } from '@/src/context/ToastContext';
import { UIProvider } from '@/src/context/UIContext';
import messages from '../../messages/en.json';

/**
 * Renders a component inside the providers the root layout always supplies.
 *
 * Calling `render` directly renders a fragment of the app in a context the app
 * never actually runs in. That was harmless until pages started using
 * `useToast` — which throws outside its provider — and four page tests failed
 * for a reason that had nothing to do with what they were testing.
 *
 * Adding the wrapper here rather than in each test keeps the next admin page
 * test from rediscovering the same thing, and means a provider added to the
 * layout later is added in one place.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, {
    ...options,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <UIProvider>
          <ToastProvider>{children}</ToastProvider>
        </UIProvider>
      </NextIntlClientProvider>
    ),
  });
}

export * from '@testing-library/react';
