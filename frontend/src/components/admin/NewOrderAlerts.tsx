"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminI18n } from "./AdminI18n";
import { useOrderPulse } from "./OrderPulse";
import { useToast } from "./Toast";

const STORAGE_KEY = "chuvachi-admin-alerts"; // "on" when this device wants sound + pop-ups

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function saveEnabled(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked (private window): the setting just isn't remembered.
  }
}

// A short two-note "ding" made in the browser, so no sound file is needed.
function playDing(context: AudioContext) {
  const start = context.currentTime;
  [880, 1320].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const at = start + index * 0.18;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.55);
  });
}

// Watches for new orders on every admin page: shows a pop-up message, and on devices where
// staff switched alerts on, plays a sound and shows a system notification.
// Also puts the number of unconfirmed orders in the browser tab title.
export function NewOrderAlerts() {
  const { t } = useAdminI18n();
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const lastSeenId = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const { pulse } = useOrderPulse();

  useEffect(() => {
    const on = readEnabled();
    setEnabled(on);
    enabledRef.current = on;
  }, []);

  // Count of orders waiting for the payment check in the browser tab title, e.g. "(2) Chuvachi".
  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    const waiting = pulse?.waiting ?? 0;
    document.title = waiting > 0 ? `(${waiting}) ${baseTitle}` : baseTitle;
  }, [pulse?.waiting]);

  useEffect(() => {
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, []);

  // Announce orders newer than the last one seen. The first answer only remembers where we are.
  useEffect(() => {
    if (!pulse) return;
    const { latestId, latestCode } = pulse;
    if (lastSeenId.current !== null && latestId > lastSeenId.current) {
      const text = t.alerts.newOrder.replace("{code}", latestCode ?? "");
      toast.success(text);
      if (enabledRef.current) {
        if (audio.current) playDing(audio.current);
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Chuvachi", { body: text, tag: "chuvachi-new-order" });
          } catch {
            // Some phone browsers only allow notifications from an installed app; the sound still plays.
          }
        }
      }
    }
    lastSeenId.current = latestId;
  }, [pulse, t, toast]);

  async function turnOn() {
    // Browsers only allow sound after a click, so the audio is prepared here.
    audio.current ??= new AudioContext();
    await audio.current.resume();
    playDing(audio.current);
    setSoundReady(true);
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    saveEnabled(true);
    enabledRef.current = true;
    setEnabled(true);
  }

  function turnOff() {
    saveEnabled(false);
    enabledRef.current = false;
    setEnabled(false);
  }

  // After a page reload the sound needs one click again (browser rule); the button says so.
  const needsClick = enabled && !soundReady;

  return (
    <button
      type="button"
      onClick={enabled && !needsClick ? turnOff : turnOn}
      className={`flex min-h-9 items-center gap-1.5 border-[1.5px] border-white px-2.5 text-[13px] font-bold ${
        enabled && !needsClick ? "bg-white text-black" : "text-white"
      }`}
      aria-pressed={enabled && !needsClick}
    >
      <SpeakerIcon off={!enabled || needsClick} />
      <span className="hidden sm:inline">{needsClick ? t.alerts.resume : enabled ? t.alerts.on : t.alerts.off}</span>
    </button>
  );
}

// Thin line speaker (sound on/off) in the page's black-and-white style; the bell icon is the order inbox.
function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9h4l5-4v14l-5-4H4V9Z" strokeLinejoin="round" />
      {off ? <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" /> : <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" strokeLinecap="round" />}
    </svg>
  );
}
