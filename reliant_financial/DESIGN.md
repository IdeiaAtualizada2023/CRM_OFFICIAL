---
name: Reliant Financial
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002113'
  on-tertiary-container: '#009668'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  h1:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  h2:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  h3:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin: 32px
  max_width: 1440px
---

## Brand & Style

This design system is built on the core principles of **Precision, Transparency, and Security**. Designed for high-stakes sales and financial management, it balances a rigorous corporate structure with a modern, high-performance aesthetic.

The design style follows a **Corporate Modern** approach with a focus on high-information density. It utilizes a sophisticated layering system to organize complex data without overwhelming the user. The interface prioritizes clarity through generous whitespace and a strictly governed hierarchy, ensuring that users can make informed financial decisions at a glance. The emotional response is one of controlled confidence and institutional reliability.

## Colors

The palette is anchored by "Midnight Slate" (Primary), a deep blue that evokes stability and executive authority. "Azure Blue" (Secondary) is used sparingly for primary actions and focus states to guide the eye without causing fatigue.

Status colors are critical for this design system:
- **Success (Paid):** A crisp Emerald green that signals completion.
- **Warning (Pending):** A warm Amber that indicates action required or processing.
- **Error (Overdue):** A high-visibility Red for immediate attention.

Backgrounds utilize a tiered system of clean whites and subtle off-whites (`#F8FAFC`) to separate the navigation from the primary workspace containers.

## Typography

Inter is the sole typeface for this design system, selected for its exceptional legibility in data-heavy environments. The system leverages Inter's OpenType features—specifically **tabular figures (tnum)**—for all numerical data to ensure columns of currency and percentages align perfectly in tables.

Hierarchy is established primarily through weight transitions rather than aggressive size changes. Body text is optimized at 14px for density, while labels utilize a semi-bold weight and slightly increased letter spacing for clarity in small-scale UI elements like table headers and badge labels.

## Layout & Spacing

This design system utilizes a **Fixed Grid** model for the primary content area, centered on a 1440px canvas to maintain a consistent reading experience on wide monitors. It follows an 8px spatial grid to ensure mathematical harmony across all components.

Main layout regions:
- **Sidebar:** Fixed at 280px for persistent navigation.
- **Header:** Fixed at 72px height with a blurred background.
- **Content Area:** 12-column grid with 24px gutters.

Tables and forms should use "Compact" spacing (8px internal padding) to maximize information density while maintaining a clear tap/click target for all interactive elements.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** and low-contrast outlines rather than heavy shadows. This keeps the interface feeling "light" and fast.

- **Level 0 (Base):** The main background (`#F8FAFC`).
- **Level 1 (Cards/Containers):** Pure white (`#FFFFFF`) with a 1px border in `#E2E8F0`. No shadow.
- **Level 2 (Dropdowns/Modals):** Pure white with a subtle ambient shadow (0px 4px 12px rgba(0, 0, 0, 0.05)) to indicate interactivity and separation.
- **Active State:** Elements being dragged or interacted with use a 1px border of the Secondary color (`#3B82F6`).

## Shapes

The shape language is **Soft** (0.25rem/4px base). This provides a subtle modern touch that softens the "grid" feel without appearing overly consumer-oriented or playful. Larger components like cards and modals utilize `rounded-lg` (8px) to create a distinct containerized look. 

Status badges use a fully rounded (pill) radius to differentiate them from interactive buttons and input fields, signaling that they are indicators rather than triggers.

## Components

### Data Tables
Tables are the heart of the design system. They must feature sticky headers, zebra striping on hover only, and a 1px horizontal divider between rows. Text should be vertically centered. Use `data-mono` for all currency columns, right-aligned.

### Status Badges
Badges use a "soft-fill" approach: a light background (10% opacity of the status color) with high-contrast text.
- **Paid:** Green background, Dark Green text.
- **Pending:** Amber background, Dark Amber text.
- **Overdue:** Red background, Dark Red text.

### Inputs & Forms
Inputs use a white fill with a 1px `#CBD5E1` border. On focus, the border transitions to the Secondary blue with a subtle 2px outer glow. Labels should always be positioned above the input field, never as placeholders.

### Primary Buttons
Buttons use a solid fill of the Primary Slate or Secondary Blue. They utilize the `label-md` typography style for clarity. Text is center-aligned with 16px horizontal padding.

### Metric Cards
Specific to sales dashboards, these cards feature a large `h2` value, a `label-sm` title, and a small trend indicator (sparkline or percentage change) in the bottom right corner.