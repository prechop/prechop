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

    /* Solid-fill BUTTON tokens — white-label-on-fill. The bright brand hues
       (primary #FF5A1F, accent #1F9D57/#2FBE6C, danger #E5484D) are tuned for
       badges/borders/icons; as a fill under 15px/700 WHITE button text they all
       fail WCAG AA (primary gradient 2.59–3.12, accent 3.49, danger 3.92 — AA
       needs 4.5, and a bold ≤16px label is NOT "large text"). These are the same
       hues darkened until white clears 4.5:1 with headroom for the hover states,
       measured in Chromium. Theme-independent: a dark saturated fill carries
       white identically on the cream and charcoal surfaces, so no per-theme
       override is needed. Measured (white on fill): primary light-stop #C83F0A
       5.03 (hover ×1.04 → 4.71), primary dark-stop #A62F07 6.93; accent #0E7A3E
       5.42 (hover ×1.06 → ~4.9); danger #B82A2F 6.16 (hover ×0.94 → 6.75).
       The gold variant already passes (dark #3A2C00 text, 7.39) and is left. */
    --pc-btn-primary-bg: linear-gradient(135deg, #C83F0A 0%, #A62F07 100%);
    --pc-btn-accent-bg: #0E7A3E;
    --pc-btn-danger-bg: #B82A2F;

    /* Badge/label INK tokens — text-only. The bright brand hues above are tuned
       for fills, borders and icons; as 12px/700 text on their own -50 tints they
       all fail WCAG AA (primary 2.80, success 3.13, warning 2.32, danger 3.43,
       gold 4.03, muted 4.38 — AA needs 4.5, and 12px bold is NOT "large text").
       These inks are the same hues darkened until they pass, and are overridden
       per-theme below. Only ever use them for text on the matching -50 surface. */
    --pc-color-primary-ink: #C43C0B;  /* on --pc-color-primary-50  4.72 */
    --pc-color-success-ink: #146B3A;  /* on --pc-color-accent-50   5.89 */
    --pc-color-warning-ink: #7A4A00;  /* on --pc-color-gold-50     6.99 */
    --pc-color-danger-ink:  #B0272C;  /* on --pc-color-danger-50   5.80 */
    --pc-color-gold-ink:    #6B5200;  /* on --pc-color-gold-50     6.93 */
    --pc-color-muted-ink:   #5C5248;  /* on --pc-surface-2         6.73 */

    /* Scrim for badges/labels sitting on --pc-gradient-hero. The gradient runs
       #FF5A1F -> #F4B400 and a badge can land anywhere along it, so the bright
       gold stop is what has to pass. A white wash fails there (#fff on an 18%
       white scrim over #F4B400 is 1.66); a 55% black scrim carries #fff at
       7.39 against the worst stop. Theme-independent — the hero is never dark. */
    --pc-scrim-on-hero: rgba(0, 0, 0, 0.55);
    --pc-scrim-on-hero-border: rgba(255, 255, 255, 0.6);

    --pc-bg: #FFF6EC;
    --pc-surface: #FFFFFF;
    --pc-surface-2: #FBEFE2;
    --pc-surface-3: #F6E7D6;
    --pc-border: #F0E2D2;
    /* Decorative hairline (--pc-border, 1.27:1) is below the 3:1 WCAG 1.4.11
       floor for a control boundary. Inputs get their own darker boundary token
       that clears 3:1 against the field surface in both themes — measured
       #94856F 3.59:1 on #FFFFFF (3.36 on the cream bg), dark #7A6D5C 3.49:1 on
       #1E1813. Used only where the border IS the control's only boundary. */
    --pc-input-border: #94856F;
    /* Placeholder text — --pc-text-faint (2.69:1) reads as decorative. A real
       label is always present (so this is belt-and-braces), but darken it to
       clear AA against the field surface anyway: #807463 4.57:1 on #FFFFFF (4.27
       on cream), dark #9C8E7C 5.50:1 on #1E1813. */
    --pc-placeholder: #807463;
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

      /* On the dark -50 tints the bright hues are the legible choice, so the
         inks mostly resolve back to them. Two do NOT: danger #E5484D on
         #2C1614 is 4.36 and gold #9A7400 on #2C2410 is 3.56 — both fail AA, so
         dark gets its own lifted values (6.81 / 8.32). */
      --pc-color-primary-ink: #FF5A1F;  /* on #2A1810  5.45 */
      --pc-color-success-ink: #2FBE6C;  /* on #16281D  6.42 */
      --pc-color-warning-ink: #F08C00;  /* on #2C2410  6.19 */
      --pc-color-danger-ink:  #FF7B7F;  /* on #2C1614  6.81 */
      --pc-color-gold-ink:    #F4B400;  /* on #2C2410  8.32 */
      --pc-color-muted-ink:   #B6A491;  /* on #2A2119  6.55 */

      --pc-bg: #14100C;
      --pc-surface: #1E1813;
      --pc-surface-2: #2A2119;
      --pc-surface-3: #342A20;
      --pc-border: #382D22;
      --pc-input-border: #7A6D5C;
      --pc-placeholder: #9C8E7C;
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
    --pc-color-primary-ink: #FF5A1F;
    --pc-color-success-ink: #2FBE6C;
    --pc-color-warning-ink: #F08C00;
    --pc-color-danger-ink:  #FF7B7F;
    --pc-color-gold-ink:    #F4B400;
    --pc-color-muted-ink:   #B6A491;
    --pc-bg: #14100C;
    --pc-surface: #1E1813;
    --pc-surface-2: #2A2119;
    --pc-surface-3: #342A20;
    --pc-border: #382D22;
    --pc-input-border: #7A6D5C;
    --pc-placeholder: #9C8E7C;
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
    /* Restore the light inks: an explicit light choice on a dark-preferring OS
       still passes through the prefers-color-scheme block above. */
    --pc-color-primary-ink: #C43C0B;
    --pc-color-success-ink: #146B3A;
    --pc-color-warning-ink: #7A4A00;
    --pc-color-danger-ink:  #B0272C;
    --pc-color-gold-ink:    #6B5200;
    --pc-color-muted-ink:   #5C5248;
    --pc-bg: #FFF6EC;
    --pc-surface: #FFFFFF;
    --pc-surface-2: #FBEFE2;
    --pc-surface-3: #F6E7D6;
    --pc-border: #F0E2D2;
    --pc-input-border: #94856F;
    --pc-placeholder: #807463;
    --pc-text: #1A1410;
    --pc-text-muted: #7A6E62;
    --pc-text-faint: #A89C8D;
  }

  *, *::before, *::after { box-sizing: border-box; }
  /* Always reserve the scrollbar gutter so page width is identical whether or
     not a page scrolls — otherwise sticky/right-pinned header content (e.g. the
     Selling/Buying switcher) jumps horizontally between scrolling and
     non-scrolling routes. */
  html {
    height: 100%;
    scrollbar-gutter: stable;
    overflow-x: clip;
    background: var(--pc-bg);
  }
  html, body {
    padding: 0;
    margin: 0;
    width: 100%;
    max-width: 100%;
  }
  body {
    min-height: 100dvh;
    background: var(--pc-bg);
    color: var(--pc-text);
    font-family: var(--pc-font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    line-height: 1.5;
    overflow-x: clip;
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
