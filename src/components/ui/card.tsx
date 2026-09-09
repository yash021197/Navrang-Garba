import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
type CardProps<T extends ElementType> = { as?: T; className?: string; children: ReactNode } & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;
export function Card<T extends ElementType = "div">({ as, className = "", children, ...props }: CardProps<T>) { const Tag = as ?? "div"; return <Tag className={`card ${className}`} {...props}>{children}</Tag>; }
