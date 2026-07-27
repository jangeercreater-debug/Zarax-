"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
// No clientRequest - direct fetch to avoid auth redirect on Zarax page

type ZaraxState = "idle" | "connecting" | "standby" | "listening" | "speaking" | "error";

interface RoomToken { callId: string; roomName: string; livekitUrl: string; token: string; }

const STATE_LABEL: Record<ZaraxState, string> = {
  idle: "Tap to start",
  connecting: "Connecting...",
  standby: 'Say "Zarax" to wake me up',
  listening: "Listening...",
  speaking: "Speaking...",
  error: "Connection lost. Tap to retry.",
};

const STATE_COLOR: Record<ZaraxState, string> = {
  idle: "bg-zinc-800",
  connecting: "bg-zinc-700",
  standby: "bg-indigo-950",
  listening: "bg-emerald-950",
  speaking: "bg-violet-950",
  error: "bg-red-950",
};

const RING_COLOR: Record<ZaraxState, string> = {
  idle: "ring-zinc-600",
  connecting: "ring-zinc-500 animate-pulse",
  standby: "ring-indigo-700",
  listening: "ring-emerald-500 animate-pulse",
  speaking: "ring-violet-500 animate-ping",
  error: "ring-red-600",
};

export default function ZaraxPage() {
  const [state, setState] = useState<ZaraxState>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const roomRef = useRef<import("livekit-client").Room | null>(null);
  const sessionRef = useRef<{ callId: string } | null>(null);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    sessionRef.current = null;
    setState("idle");
  }, []);

  const connect = useCallback(async () => {
    try {
      setState("connecting");
      setError("");

      const { Room, RoomEvent, Track } = await import("livekit-client");

      const res = await fetch("/api/zarax", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" });
      if (!res.ok) throw new Error("Could not start Zarax session");
      const json = await res.json() as { data: RoomToken };
      const token = json.data;
      sessionRef.current = { callId: token.callId };

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, () => {
        setState("standby");
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const agentSpeaking = speakers.some(s => s.identity.startsWith("agent-"));
        const callerSpeaking = speakers.some(s => s.identity.startsWith("caller-"));
        if (agentSpeaking) setState("speaking");
        else if (callerSpeaking) setState("listening");
        else if (state !== "standby") setState("standby");
      });

      room.on(RoomEvent.Disconnected, () => {
        setState("idle");
        roomRef.current = null;
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = "none";
          document.body.appendChild(el);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => el.remove());
      });

      await room.connect(token.livekitUrl, token.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("standby");

    } catch (err) {
      console.error("Zarax connect error:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setState("error");
    }
  }, [state]);

  const toggleMute = () => {
    if (!roomRef.current) return;
    const newMuted = !muted;
    roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted).catch(console.error);
    setMuted(newMuted);
  };

  // Cleanup on unmount
  useEffect(() => { return () => { roomRef.current?.disconnect(); }; }, []);

  const isConnected = state !== "idle" && state !== "connecting" && state !== "error";

  return (
    <div className={"min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center transition-colors duration-700 rounded-2xl " + STATE_COLOR[state]}>
      <div className="flex flex-col items-center gap-8">

        {/* Main orb button */}
        <button
          onClick={isConnected ? disconnect : connect}
          disabled={state === "connecting"}
          className={"relative flex items-center justify-center w-40 h-40 rounded-full transition-all duration-300 ring-4 ring-offset-4 ring-offset-transparent focus:outline-none " + RING_COLOR[state] + (isConnected ? " bg-white/10 hover:bg-white/20" : " bg-white/5 hover:bg-white/10")}
        >
          {state === "connecting" ? (
            <Loader2 className="h-16 w-16 text-white/70 animate-spin" />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="text-5xl select-none">Z</span>
              <span className="text-xs text-white/50 font-light tracking-widest uppercase">zarax</span>
            </div>
          )}
        </button>

        {/* Status label */}
        <p className="text-white/70 text-sm font-light tracking-wide">{STATE_LABEL[state]}</p>
        {error && <p className="text-red-400 text-xs max-w-xs text-center">{error}</p>}

        {/* Mute button (only when connected) */}
        {isConnected && (
          <button
            onClick={toggleMute}
            className={"flex items-center gap-2 px-4 py-2 rounded-full text-xs font-light transition-all " + (muted ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/60 hover:bg-white/20")}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {muted ? "Unmute" : "Mute"}
          </button>
        )}
      </div>
    </div>
  );
}