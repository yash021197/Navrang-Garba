"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type VideoState = { paused: boolean; readyState: number; currentTime: number };

export function HeroPlaybackDiagnostic() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<VideoState>({ paused: true, readyState: 0, currentTime: 0 });

  useEffect(() => {
    const heroVideo = document.querySelector<HTMLVideoElement>(".hero-video");
    const hero = document.querySelector<HTMLElement>(".hero-premium");
    if (!heroVideo || !hero) return;
    const update = () => setState({ paused: heroVideo.paused, readyState: heroVideo.readyState, currentTime: heroVideo.currentTime });
    const events = ["loadeddata", "canplay", "playing", "pause", "stalled", "waiting", "error", "timeupdate"];
    events.forEach((event) => heroVideo.addEventListener(event, update));
    const frame = window.requestAnimationFrame(() => { update(); setVideo(heroVideo); setTarget(hero); });
    const interval = window.setInterval(update, 500);
    return () => { events.forEach((event) => heroVideo.removeEventListener(event, update)); window.cancelAnimationFrame(frame); window.clearInterval(interval); };
  }, []);

  if (!video || !target) return null;
  const playing = !state.paused && state.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  return createPortal(<aside className="hero-playback-diagnostic" aria-live="polite"><strong>{playing ? "VIDEO PLAYING" : "VIDEO NOT PLAYING"}</strong><span>paused={String(state.paused)}</span><span>time={state.currentTime.toFixed(1)}</span><span>readyState={state.readyState}</span>{!playing ? <button type="button" onClick={() => { void video.play().catch(() => undefined); }}>TEST VIDEO PLAY</button> : null}</aside>, target);
}
