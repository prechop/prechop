"use client";

import { createGlobalStyle } from "styled-components";

// Prechop "Jollof" design tokens — `--pc-*` CSS custom properties.
// Afro-modern, warm, food-forward. Pepper orange + plantain gold + palm green
// on a cream canvas (light "Cream" / dark "Charcoal"). Theme-aware via
// prefers-color-scheme + [data-theme] override.
export const GlobalStyle = createGlobalStyle`
  :root {
    --pc-color-primary: #FF5A1F;
    --pc-color-primary-600: #E5480F;
    --pc-color-primary-700: #C43C0B;
    --pc-color-primary-50: #FFF0E6;
    --pc-color-accent: #1F9D57;
    --pc-color-accent-600: #17864A;
    --pc-color-accent-50: #E7F6EE;
    --pc-color-gold: #F4B400;
    --pc-color-gold-50: #FFF7E0;
    --pc-color-danger: #E5484D;
    --pc-color-danger-50: #FDECEC;
    --pc-color-warning: #F08C00;

    --pc-bg: #FFF6EC;
    --pc-surface: #FFFFFF;
    --pc-surface-2: #FBEFE2;
    --pc-surface-3: #F6E7D6;
    --pc-border: #F0E2D2;
    --pc-text: #1A1410;
    --pc-text-muted: #7A6E62;
    --pc-text-faint: #A89C8D;
    --pc-text-inverse: #FFFFFF;

    --pc-gradient-hero: linear-gradient(135deg, #FF5A1F 0%, #F4B400 100%);
    --pc-gradient-warm: linear-gradient(135deg, #FF7A3D 0%, #FF5A1F 100%);
    --pc-gradient-mesh: radial-gradient(1000px 600px at 80% -10%, rgba(244,180,0,0.22), transparent 60%), radial-gradient(800px 500px at -10% 10%, rgba(255,90,31,0.18), transparent 55%);

    --pc-radius-sm: 10px;
    --pc-radius: 16px;
    --pc-radius-lg: 24px;
    --pc-radius-xl: 32px;
    --pc-radius-pill: 999px;

    --pc-shadow-sm: 0 1px 2px rgba(26, 20, 16, 0.06);
    --pc-shadow: 0 4px 16px rgba(26, 20, 16, 0.08);
    --pc-shadow-lg: 0 18px 48px rgba(26, 20, 16, 0.14);
    --pc-shadow-primary: 0 10px 28px rgba(255, 90, 31, 0.30);

    --pc-space-1: 4px;
    --pc-space-2: 8px;
    --pc-space-3: 12px;
    --pc-space-4: 16px;
    --pc-space-5: 24px;
    --pc-space-6: 32px;
    --pc-space-8: 48px;
    --pc-space-10: 64px;

    --pc-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --pc-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --pc-dur: 0.2s;
    --pc-dur-slow: 0.4s;

    --pc-font-sans: var(--pc-font-sans-loaded, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
    --pc-font-display: var(--pc-font-display-loaded, var(--pc-font-sans));
    --pc-maxw: 1160px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --pc-color-primary-50: #2A1810;
      --pc-color-accent: #2FBE6C;
      --pc-color-accent-50: #16281D;
      --pc-color-gold-50: #2C2410;
      --pc-color-danger-50: #2C1614;

      --pc-bg: #14100C;
      --pc-surface: #1E1813;
      --pc-surface-2: #2A2119;
      --pc-surface-3: #342A20;
      --pc-border: #382D22;
      --pc-text: #FBF3E9;
      --pc-text-muted: #B6A491;
      --pc-text-faint: #857766;
      --pc-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
      --pc-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
      --pc-shadow-lg: 0 18px 48px rgba(0, 0, 0, 0.55);
      --pc-gradient-mesh: radial-gradient(1000px 600px at 80% -10%, rgba(244,180,0,0.14), transparent 60%), radial-gradient(800px 500px at -10% 10%, rgba(255,90,31,0.16), transparent 55%);
    }
  }

  :root[data-theme="dark"] {
    --pc-color-primary-50: #2A1810;
    --pc-color-accent: #2FBE6C;
    --pc-color-accent-50: #16281D;
    --pc-color-gold-50: #2C2410;
    --pc-color-danger-50: #2C1614;
    --pc-bg: #14100C;
    --pc-surface: #1E1813;
    --pc-surface-2: #2A2119;
    --pc-surface-3: #342A20;
    --pc-border: #382D22;
    --pc-text: #FBF3E9;
    --pc-text-muted: #B6A491;
    --pc-text-faint: #857766;
    --pc-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
    --pc-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    --pc-shadow-lg: 0 18px 48px rgba(0, 0, 0, 0.55);
    --pc-gradient-mesh: radial-gradient(1000px 600px at 80% -10%, rgba(244,180,0,0.14), transparent 60%), radial-gradient(800px 500px at -10% 10%, rgba(255,90,31,0.16), transparent 55%);
  }
  :root[data-theme="light"] {
    --pc-color-primary-50: #FFF0E6;
    --pc-color-accent: #1F9D57;
    --pc-color-accent-50: #E7F6EE;
    --pc-color-gold-50: #FFF7E0;
    --pc-color-danger-50: #FDECEC;
    --pc-bg: #FFF6EC;
    --pc-surface: #FFFFFF;
    --pc-surface-2: #FBEFE2;
    --pc-surface-3: #F6E7D6;
    --pc-border: #F0E2D2;
    --pc-text: #1A1410;
    --pc-text-muted: #7A6E62;
    --pc-text-faint: #A89C8D;
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { height: 100%; }
  html, body { padding: 0; margin: 0; }
  body {
    min-height: 100dvh;
    width: 100%;
    background: var(--pc-bg);
    color: var(--pc-text);
    font-family: var(--pc-font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    line-height: 1.5;
  }
  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; }
  img { max-width: 100%; display: block; }
  h1, h2, h3, h4 { margin: 0; line-height: 1.1; font-family: var(--pc-font-display); }
  input, select, textarea { font-family: inherit; }
  ::selection { background: rgba(255, 90, 31, 0.22); }

  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--pc-border); border-radius: 999px; border: 2px solid var(--pc-bg); }
  ::-webkit-scrollbar-thumb:hover { background: var(--pc-text-faint); }

  @keyframes pc-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pc-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pc-shimmer { 100% { transform: translateX(100%); } }
`;
