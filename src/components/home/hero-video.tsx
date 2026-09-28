"use client";

import { useEffect, useRef } from "react";

type HeroVideoProps = { desktopSource: string; mobileSource?: string; poster: string };

export function HeroVideo({ desktopSource, mobileSource, poster }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.muted = true;
    video.defaultMuted = true;
    void video.play().catch(() => {
      // iOS Low Power Mode and Data Saver can block decorative autoplay. The poster remains visible.
    });
  }, []);

  return <video ref={videoRef} className="hero-video" autoPlay muted loop playsInline preload="metadata" poster={poster} aria-hidden="true" disablePictureInPicture tabIndex={-1}>{mobileSource ? <source media="(max-width: 720px)" src={mobileSource} type="video/mp4" /> : null}<source src={desktopSource} type="video/mp4" /></video>;
}
