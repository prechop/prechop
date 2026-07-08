"use client";

import { createGlobalStyle } from "styled-components";

// Prechop design tokens — `--pc-*` CSS custom properties. Warm, food-forward
// palette. Theme-aware via prefers-color-scheme + [data-theme] override.
export const GlobalStyle = createGlobalStyle`
  :root {
    --pc-color-primary: #E8590C;
    --pc-color-primary-600: #D14C05;
    --pc-color-primary-50: #FFF4EC;
    --pc-color-accent: #2B8A3E;
    --pc-color-danger: #E03131;
    --pc-color-warning: #F08C00;

    --pc-bg: #FAF8F4;
    --pc-surface: #FFFFFF;
    --pc-surface-2: #F4F0E9;
    --pc-border: #E7E1D6;
    --pc-text: #201A15;
    --pc-text-muted: #6B6157;
    --pc-text-inverse: #FFFFFF;

    --pc-radius-sm: 8px;
    --pc-radius: 14px;
    --pc-radius-lg: 22px;
    --pc-shadow: 0 2px 8px rgba(32, 26, 21, 0.06);
    --pc-shadow-lg: 0 12px 32px rgba(32, 26, 21, 0.12);

    --pc-space-1: 4px;
    --pc-space-2: 8px;
    --pc-space-3: 12px;
    --pc-space-4: 16px;
    --pc-space-5: 24px;
    --pc-space-6: 32px;
    --pc-space-8: 48px;

    --pc-font-sans: var(--pc-font-sans-loaded, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
    --pc-maxw: 1120px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --pc-bg: #16130F;
      --pc-surface: #201B16;
      --pc-surface-2: #2A241D;
      --pc-border: #362E25;
      --pc-text: #F4EFE8;
      --pc-text-muted: #A89E90;
      --pc-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      --pc-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.5);
    }
  }

  :root[data-theme="dark"] {
    --pc-bg: #16130F;
    --pc-surface: #201B16;
    --pc-surface-2: #2A241D;
    --pc-border: #362E25;
    --pc-text: #F4EFE8;
    --pc-text-muted: #A89E90;
  }
  :root[data-theme="light"] {
    --pc-bg: #FAF8F4;
    --pc-surface: #FFFFFF;
    --pc-surface-2: #F4F0E9;
    --pc-border: #E7E1D6;
    --pc-text: #201A15;
    --pc-text-muted: #6B6157;
  }

  *, *::before, *::after { box-sizing: border-box; }
  html, body { padding: 0; margin: 0; }
  body {
    background: var(--pc-bg);
    color: var(--pc-text);
    font-family: var(--pc-font-sans);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; }
  img { max-width: 100%; display: block; }
  h1, h2, h3, h4 { margin: 0; line-height: 1.2; }
  input, select, textarea { font-family: inherit; }
`;
