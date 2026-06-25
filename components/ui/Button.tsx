import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-black text-white hover:bg-[#1b1b1b]",
  secondary: "border border-[#e1e3e4] bg-[#f3f4f5] text-[#191c1d] hover:bg-[#e7e8e9]",
  ghost: "bg-transparent text-[#4c4546] hover:bg-[#f3f4f5] hover:text-black",
  danger: "bg-[#ba1a1a] text-white hover:bg-[#93000a]"
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      data-variant={variant}
      className={clsx(
        "copic-control copic-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition duration-200",
        "button-format",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3A3A3A]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F5F5F5]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
