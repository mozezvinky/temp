export const tempDesignSystem = {
  colors: {
    background: "#F8F9FA",
    surface: "#FFFFFF",
    surfaceRaised: "#F3F4F5",
    border: "#E2E4E5",
    text: "#191C1D",
    muted: "#625B5C",
    subtle: "#7E7576",
    accent: "#B2F746",
    success: "#446900",
    warning: "#9A6200",
    error: "#BA1A1A"
  },
  typography: {
    h1: "text-2xl md:text-4xl font-bold leading-tight text-[#191C1D] tracking-[-.02em]",
    h2: "text-xl md:text-2xl font-semibold leading-tight text-[#191C1D] tracking-[-.01em]",
    h3: "text-base font-semibold leading-snug text-[#191C1D]",
    body: "text-sm leading-6 text-[#625B5C]",
    caption: "text-xs font-medium text-[#7E7576]"
  },
  spacing: {
    xs: "gap-2",
    sm: "gap-4",
    md: "gap-6",
    lg: "gap-8",
    xl: "gap-12",
    section: "py-8 md:py-12",
    page: "px-page",
    card: "p-card",
    stack: "copic-stack"
  },
  components: {
    card: "bone-card rounded-3xl p-card",
    input: "temp-input px-4 py-3 outline-none",
    label: "temp-label",
    table: "overflow-hidden rounded-2xl border border-[#E2E4E5] bg-white",
    modal: "rounded-[1.75rem] border border-[#E2E4E5] bg-white p-5 shadow-[0_28px_90px_rgba(0,0,0,.28)]",
    alert: "rounded-2xl border border-[#E2E4E5] bg-white p-4 text-sm"
  }
} as const;
