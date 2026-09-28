"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function MobileBookCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero");
    if (!hero || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0.15 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  return <Link className={`mobile-book${show ? " is-visible" : ""}`} href="/tickets">Book tickets</Link>;
}
