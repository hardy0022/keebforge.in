import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "prime" | "ghost";
type Size = "md" | "lg";

type Props = {
  variant?: Variant;
  size?: Size;
  href?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<ComponentProps<"button">, "className" | "children">;

export function Button({ variant = "prime", size = "md", href, className, children, ...rest }: Props) {
  const cls = [
    variant === "prime" ? "btn-prime" : "btn-ghost",
    size === "lg" ? "btn-prime-lg" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}