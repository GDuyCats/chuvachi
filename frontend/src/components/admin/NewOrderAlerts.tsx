"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import { useAdminI18n } from "./AdminI18n";
import { useToast } from "./Toast";

const POLL_MS = 20_000;
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

  useEffect(() => {
    const on = readEnabled();
    setEnabled(on);
    enabledRef.current = on;
  }, []);

  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    let stopped = false;

    async function check() {
      try {
        const { latestId, latestCode, waiting } = await adminApi.latestOrder();
        if (stopped) return;
        document.title = waiting > 0 ? `(${waiting}) ${baseTitle}` : baseTitle;

        // The first check only remembers where we are; later checks announce what's new.
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
      } catch {
        // Signed out or offline: the page itself handles that; try again next round.
      }
    }

    void check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.title = baseTitle;
    };
  }, [t, toast]);

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
      className="flex min-h-9 items-center gap-1.5 border-[1.5px] border-white px-2.5 text-[13px] font-bold"
      aria-pressed={enabled && !needsClick}
    >
      <span aria-hidden="true">{enabled && !needsClick ? "🔔" : "🔕"}</span>
      <span className="hidden sm:inline">{needsClick ? t.alerts.resume : enabled ? t.alerts.on : t.alerts.off}</span>
    </button>
  );
}
