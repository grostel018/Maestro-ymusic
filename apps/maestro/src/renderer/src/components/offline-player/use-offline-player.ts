import {
	createQueue,
	pickAutoplay,
	type QueueState,
	addToQueue as qAdd,
	move as qMove,
	next as qNext,
	playNext as qPlayNext,
	prev as qPrev,
	removeAt as qRemoveAt,
	setRepeat as qSetRepeat,
	toggleShuffle as qToggleShuffle,
	type Repeat,
} from "@shared/player/queue";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettingsState } from "@/hooks/use-settings";
import { trpc } from "@/lib/trpc";
import { restoreQueue, type SavedQueue } from "./restore";

/** A downloaded song as the Downloads page lists it (the fields the player needs). */
export type PlayerItem = {
	videoId: string;
	title: string;
	artist: string;
	album?: string;
	durationSec?: number;
	collection?: { title: string };
	url: string | null;
	artSrc: string | null;
};

export type Boundary = "ended" | "skip" | "prev";
const REPEAT_CYCLE: Record<Repeat, Repeat> = { off: "all", all: "one", one: "off" };
const SAVE_EVERY_MS = 5000;
const REPORT_EVERY_MS = 5000;
const LISTEN_EVERY_S = 15;

/**
 * The offline player (offline player parity spec, phase 1): one media element and the shared queue. Repeat, shuffle,
 * up next, autoplay from your downloads, a queue saved across restarts, the next song preloaded, and reports to main
 * so tray, Discord, Last.fm, stats and the API follow it.
 * `onBoundary` lets the sleep timer count songs; returning true stops playback at that boundary.
 */
export function useOfflinePlayer(
	items: PlayerItem[],
	opts: {
		onBoundary?: (b: Boundary) => boolean;
		/** Slider value (0–1) to element volume, e.g. the volume-ratio curve. */
		volumeCurve?: (v: number) => number;
		/** Extra 0–1 gain, e.g. the sleep timer's fade. */
		gain?: number;
		/** The media element, when the page shares it with other hooks (sleep timer, speed, speaker). */
		audioRef?: React.RefObject<HTMLAudioElement | null>;
	} = {},
) {
	const ownAudioRef = useRef<HTMLAudioElement>(null);
	const audioRef = opts.audioRef ?? ownAudioRef;
	const preloadRef = useRef<HTMLAudioElement>(null);
	const [q, setQ] = useState<QueueState | null>(null);
	const [playing, setPlaying] = useState(false);
	const [time, setTime] = useState({ now: 0, total: 0 });
	const [volume, setVolume] = useState(1);
	const [muted, setMuted] = useState(false);
	const [queueContinue] = useSettingsState("player.queueContinue", true);
	const byId = useMemo(() => new Map(items.map((i) => [i.videoId, i])), [items]);
	const current = q ? byId.get(q.order[q.pos]) : undefined;
	const upNext = q ? byId.get(q.order[q.pos + 1] ?? (q.repeat === "all" ? q.order[0] : "")) : undefined;

	/** Whether the current song should play once it's loaded (false after a restore). */
	const wantPlay = useRef(false);
	const failures = useRef(0);
	const played = useRef(new Set<string>());
	const restoredAt = useRef<number | null>(null);
	const boundaryRef = useRef(opts.onBoundary);
	boundaryRef.current = opts.onBoundary;
	const qRef = useRef(q);
	qRef.current = q;

	const saveQueue = trpc.downloads.saveQueue.useMutation();
	const reportPlayer = trpc.downloads.reportPlayer.useMutation();
	const reportTrack = trpc.downloads.reportTrack.useMutation();
	const reportListen = trpc.downloads.reportListen.useMutation();
	const saved = trpc.downloads.getQueue.useQuery(undefined, { staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false });

	// Restore once, when the list and the saved queue are both in.
	const restored = useRef(false);
	useEffect(() => {
		if (restored.current || !saved.isFetched || !items.length) return;
		restored.current = true;
		const r = restoreQueue(saved.data as SavedQueue | null, (id) => !!byId.get(id)?.url);
		if (!r) return;
		wantPlay.current = false;
		restoredAt.current = r.positionSec;
		setQ(r.q);
	}, [saved.isFetched, saved.data, items.length, byId]);

	// A song deleted from Downloads leaves the queue.
	useEffect(() => {
		if (!q || !items.length || q.order.every((id) => byId.get(id)?.url)) return;
		let out = q;
		for (let i = q.order.length - 1; i >= 0; i--) if (!byId.get(q.order[i])?.url) out = qRemoveAt(out, i);
		setQ(out.order.length ? out : null);
	}, [byId, q, items.length]);

	const autoplayFrom = useCallback(
		(state: QueueState): QueueState | null => {
			if (!queueContinue) return null;
			const picks = pickAutoplay(
				state.order[state.pos],
				items.filter((i) => i.url),
				new Set([...played.current, ...state.order]),
			);
			if (!picks.length) return null;
			return { ...qAdd(state, picks), pos: state.order.length };
		},
		[items, queueContinue],
	);

	/** Move on at a song boundary: the sleep timer may stop here; at the end, autoplay or stop. */
	const advance = useCallback(
		(reason: "ended" | "skip") => {
			const state = qRef.current;
			if (!state) return;
			if (boundaryRef.current?.(reason)) {
				audioRef.current?.pause();
				const n = qNext(state, "skip");
				if (n) {
					wantPlay.current = false;
					setQ(n);
				}
				return;
			}
			const n = qNext(state, reason) ?? autoplayFrom(state);
			if (!n) {
				audioRef.current?.pause();
				setPlaying(false);
				return;
			}
			wantPlay.current = true;
			if (n.order[n.pos] === state.order[state.pos] && audioRef.current) {
				// Repeat one (or a one-song repeat-all): the same song again.
				audioRef.current.currentTime = 0;
				void audioRef.current.play().catch(() => setPlaying(false));
			}
			setQ(n);
		},
		[autoplayFrom],
	);

	const play = useCallback((list: PlayerItem[], startId?: string, shuffle = false) => {
		const ids = list.filter((i) => i.url).map((i) => i.videoId);
		if (!ids.length) return;
		wantPlay.current = true;
		failures.current = 0;
		const fresh = qSetRepeat(createQueue(ids, startId, shuffle), qRef.current?.repeat ?? "off");
		const el = audioRef.current;
		if (el && qRef.current && fresh.order[fresh.pos] === qRef.current.order[qRef.current.pos]) {
			el.currentTime = 0;
			void el.play().catch(() => setPlaying(false));
		}
		setQ(fresh);
	}, []);

	const toggle = useCallback(() => {
		const el = audioRef.current;
		if (!el || !qRef.current) return play(items);
		if (el.paused) {
			wantPlay.current = true;
			void el.play().catch(() => setPlaying(false));
		} else el.pause();
	}, [items, play]);

	const next = useCallback(() => advance("skip"), [advance]);
	const prev = useCallback(() => {
		const el = audioRef.current;
		const state = qRef.current;
		if (!state) return;
		boundaryRef.current?.("prev");
		if (el && el.currentTime > 3) {
			el.currentTime = 0;
			return;
		}
		wantPlay.current = !!el && !el.paused;
		setQ(qPrev(state));
	}, []);
	const seek = useCallback((sec: number) => {
		if (audioRef.current) audioRef.current.currentTime = Math.max(0, sec);
	}, []);
	const update = useCallback((fn: (s: QueueState) => QueueState) => setQ((s) => (s ? fn(s) : s)), []);
	const cycleRepeat = useCallback(() => update((s) => qSetRepeat(s, REPEAT_CYCLE[s.repeat])), [update]);
	const toggleShuffle = useCallback(() => update((s) => qToggleShuffle(s)), [update]);
	const playNext = useCallback(
		(ids: string[]) => (qRef.current ? update((s) => qPlayNext(s, ids)) : play(items.filter((i) => ids.includes(i.videoId)))),
		[update, play, items],
	);
	const addToQueue = useCallback(
		(ids: string[]) => (qRef.current ? update((s) => qAdd(s, ids)) : play(items.filter((i) => ids.includes(i.videoId)))),
		[update, play, items],
	);
	const move = useCallback((from: number, to: number) => update((s) => qMove(s, from, to)), [update]);
	const removeAt = useCallback((i: number) => {
		const state = qRef.current;
		if (!state) return;
		if (state.order.length === 1) {
			audioRef.current?.pause();
			setQ(null);
			return;
		}
		wantPlay.current = !!audioRef.current && !audioRef.current.paused;
		setQ(qRemoveAt(state, i));
	}, []);
	const jumpTo = useCallback(
		(i: number) => {
			wantPlay.current = true;
			update((s) => ({ ...s, pos: Math.max(0, Math.min(i, s.order.length - 1)) }));
		},
		[update],
	);

	// Load the current song.
	const hasQueue = q !== null;
	useEffect(() => {
		const el = audioRef.current;
		if (!el) return;
		if (!current?.url) {
			if (!hasQueue) {
				el.removeAttribute("src");
				el.load();
				setTime({ now: 0, total: 0 });
			}
			return;
		}
		if (el.src !== current.url) el.src = current.url;
		if (restoredAt.current !== null) {
			el.currentTime = restoredAt.current;
			restoredAt.current = null;
		}
		played.current.add(current.videoId);
		if (wantPlay.current) void el.play().catch(() => setPlaying(false));
		if ("mediaSession" in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: current.title,
				artist: current.artist,
				album: current.album ?? current.collection?.title ?? "",
				...(current.artSrc ? { artwork: [{ src: current.artSrc }] } : {}),
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [current?.videoId, current?.url, hasQueue]);

	// Preload the next song so Next starts at once.
	useEffect(() => {
		const el = preloadRef.current;
		if (el && upNext?.url && el.src !== upNext.url) el.src = upNext.url;
	}, [upNext?.url]);

	useEffect(() => {
		if (!audioRef.current) return;
		const curve = opts.volumeCurve ?? ((v: number) => v);
		audioRef.current.volume = Math.max(0, Math.min(1, curve(volume) * (opts.gain ?? 1)));
		audioRef.current.muted = muted;
	}, [volume, muted, opts.volumeCurve, opts.gain]);

	// OS media keys.
	useEffect(() => {
		if (!("mediaSession" in navigator)) return;
		const ms = navigator.mediaSession;
		ms.setActionHandler("play", () => toggle());
		ms.setActionHandler("pause", () => audioRef.current?.pause());
		ms.setActionHandler("nexttrack", () => next());
		ms.setActionHandler("previoustrack", () => prev());
		return () => {
			for (const a of ["play", "pause", "nexttrack", "previoustrack"] as const) ms.setActionHandler(a, null);
		};
	}, [toggle, next, prev]);

	// Save the queue: on every change, and the position every few seconds while playing.
	const lastSave = useRef(0);
	const save = useCallback(
		(force = false) => {
			const state = qRef.current;
			if (!state) return;
			const now = Date.now();
			if (!force && now - lastSave.current < SAVE_EVERY_MS) return;
			lastSave.current = now;
			saveQueue.mutate({ q: state, positionSec: audioRef.current?.currentTime ?? 0 });
		},
		[saveQueue],
	);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- only on these changes
	useEffect(() => save(true), [q]);

	// Reports to main: whether Downloads holds a queue, and the song for tray/Discord/Last.fm/API.
	// eslint-disable-next-line react-hooks/exhaustive-deps -- only on these changes
	useEffect(() => {
		reportPlayer.mutate({ hasQueue, playing });
	}, [hasQueue, playing]);
	const lastReport = useRef(0);
	const report = useCallback(
		(force = false) => {
			const el = audioRef.current;
			if (!current || !el) return;
			const now = Date.now();
			if (!force && now - lastReport.current < REPORT_EVERY_MS) return;
			lastReport.current = now;
			reportTrack.mutate({
				videoId: current.videoId,
				title: current.title,
				artist: current.artist,
				album: current.album,
				durationSec: current.durationSec ?? (Number.isFinite(el.duration) ? el.duration : undefined),
				playing: !el.paused,
				position: el.currentTime || 0,
				volume: Math.round((muted ? 0 : volume) * 100),
			});
		},
		[current, reportTrack, volume, muted],
	);
	// eslint-disable-next-line react-hooks/exhaustive-deps -- only on these changes
	useEffect(() => report(true), [current?.videoId, playing, volume, muted]);

	// Seconds actually played, for Your stats.
	const listen = useRef({ id: "", sec: 0, last: 0 });
	const onTime = useCallback(
		(el: HTMLAudioElement) => {
			setTime({ now: el.currentTime, total: el.duration || 0 });
			report();
			save();
			if (!current || el.paused) return;
			if (listen.current.id !== current.videoId) listen.current = { id: current.videoId, sec: 0, last: el.currentTime };
			const delta = el.currentTime - listen.current.last;
			listen.current.last = el.currentTime;
			if (delta > 0 && delta < 2) listen.current.sec += delta;
			if (listen.current.sec >= LISTEN_EVERY_S) {
				reportListen.mutate({ videoId: current.videoId, title: current.title, artist: current.artist, seconds: Math.round(listen.current.sec) });
				listen.current.sec = 0;
			}
		},
		[current, report, save, reportListen],
	);

	// Commands from tray, shortcuts, the API, Stream Deck and remote (main routes them here while we're active).
	trpc.downloads.onCommand.useSubscription(undefined, {
		onData: (c) => {
			const el = audioRef.current;
			switch (c.command) {
				case "play":
					if (el?.paused) toggle();
					break;
				case "pause":
					el?.pause();
					break;
				case "next":
					next();
					break;
				case "prev":
					prev();
					break;
				case "seek":
					if (typeof c.value === "number") seek(c.value);
					break;
				case "volume":
					if (typeof c.value === "number") {
						setVolume(c.value / 100);
						setMuted(false);
					}
					break;
				case "repeat":
					cycleRepeat();
					break;
				case "shuffle":
					toggleShuffle();
					break;
			}
		},
	});

	/** Props for the player's <audio> element. */
	const audioProps = {
		ref: audioRef,
		onPlay: () => {
			failures.current = 0;
			setPlaying(true);
		},
		onPause: () => setPlaying(false),
		onEnded: () => advance("ended"),
		onTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => onTime(e.currentTarget),
		onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => setTime({ now: e.currentTarget.currentTime, total: e.currentTarget.duration || 0 }),
		onError: () => {
			if (!qRef.current) return;
			failures.current += 1;
			if (failures.current < qRef.current.order.length) advance("skip");
			else setPlaying(false);
		},
	};

	return {
		q,
		current,
		upNext,
		byId,
		playing,
		time,
		volume,
		muted,
		setVolume,
		setMuted,
		play,
		toggle,
		next,
		prev,
		seek,
		cycleRepeat,
		toggleShuffle,
		playNext,
		addToQueue,
		move,
		removeAt,
		jumpTo,
		audioRef,
		preloadRef,
		audioProps,
	};
}

export type OfflinePlayer = ReturnType<typeof useOfflinePlayer>;
