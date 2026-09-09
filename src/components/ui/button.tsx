import Link from "next/link";
import type { ComponentProps } from "react";
export function ButtonLink({ className = "", ...props }: ComponentProps<typeof Link>) { return <Link className={`button ${className}`} {...props} />; }
