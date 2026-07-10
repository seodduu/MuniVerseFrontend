import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { logPlayTrack, playTrack } from "../api/music";
import { isLoggedIn } from "../api/auth";

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  isAi?: boolean;
  duration?: string;
  coverUrl?: string;
  audioUrl?: string;
  likeCount?: number;
  musicId?: number;
  /** 백엔드 앨범 ID (있으면 큰 커버 이미지 조회에 사용) */
  albumId?: number | null;
};

export type PlayerContextValue = {
  current: PlayerTrack | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  queue: PlayerTrack[];
  history: PlayerTrack[];

  playList: (tracks: PlayerTrack[]) => void;
  playListShuffled: (tracks: PlayerTrack[]) => void;
  playTracks: (tracks: PlayerTrack[], opts?: { shuffle?: boolean }) => void;
  playListAtIndex: (tracks: PlayerTrack[], index: number) => void;
  enqueueTracks: (tracks: PlayerTrack[], opts?: { shuffle?: boolean }) => void;

  volume: number;
  setVolume: (v: number) => void;

  setTrackAndPlay: (track: PlayerTrack) => void;
  toggle: () => void;
  seek: (sec: number) => void;

  removeFromQueue: (trackId: string) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;

  shuffleQueue: () => void;
  seekBackward: (seconds?: number) => void;
  seekForward: (seconds?: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  repeatMode: "off" | "one";
  toggleRepeat: () => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}

const shuffleCopy = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [history, setHistory] = useState<PlayerTrack[]>([]);

  const [repeatMode, setRepeatMode] = useState<"off" | "one">("off");
  const repeatModeRef = useRef<"off" | "one">("off");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRef = useRef<PlayerTrack | null>(null);
  const isPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  // ✅ 볼륨 상태 (0~1) - localStorage에서 불러오기
  const [volume, _setVolume] = useState(() => {
    const saved = localStorage.getItem("player-volume");
    return saved !== null ? parseFloat(saved) : 0.8;
  });
  const setVolume = useCallback((v: number) => {
    const vol = Math.max(0, Math.min(1, v));
    _setVolume(vol);
    localStorage.setItem("player-volume", String(vol));
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  // ✅ history helper: key = musicId 우선, 없으면 id
  const trackKey = useCallback((t: PlayerTrack) => (t.musicId ?? t.id).toString(), []);

  const pushHistory = useCallback(
    (track: PlayerTrack) => {
      setHistory((prev) => {
        const key = trackKey(track);
        const next = [track, ...prev.filter((x) => trackKey(x) !== key)];
        return next.slice(0, 50);
      });
    },
    [trackKey]
  );

  // ✅ 오디오 초기화 & 이벤트 리스너 (1회)
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const handleEnded = () => {
      const currentRepeatMode = repeatModeRef.current;
      const cur = currentRef.current;

      if (currentRepeatMode === "one" && cur) {
        const a = audioRef.current;
        if (!a) return;

        a.currentTime = 0;
        setProgress(0);

        const p = a.play();
        if (p) {
          p.catch((e) => {
            if (e?.name === "AbortError") return;
            console.error("[PlayerContext] repeat play failed:", e);
            setIsPlaying(false);
          });
        }
        return;
      }

      // ✅ 곡 끝 → 큐에서 다음 곡으로 넘어가기 (여기서 history 업데이트!)
      setQueue((q) => {
        if (q.length > 0) {
          const next = q[0];

          // ✅ 끝난 곡을 기록에 남김
          if (cur) pushHistory(cur);

          setCurrent(next);
          setProgress(0);
          return q.slice(1);
        }

        // 큐가 비면 정지
        if (cur) pushHistory(cur);
        setIsPlaying(false);
        setProgress(0);
        return q;
      });
    };

    const handleError = () => {
      const a = audioRef.current;
      if (!a) {
        setIsPlaying(false);
        return;
      }

      const t = currentRef.current;
      const err = a.error;

      if (err) {
        let msg = "알 수 없는 오류";
        switch (err.code) {
          case 1:
            msg = "재생이 중단되었습니다";
            break;
          case 2:
            msg = "네트워크 오류로 인해 재생할 수 없습니다";
            break;
          case 3:
            msg = "오디오 파일 디코딩 오류";
            break;
          case 4:
            msg = "지원하지 않는 오디오 형식이거나 URL이 잘못되었습니다";
            break;
        }
        console.error(`[PlayerContext] audio error (code: ${err.code})`, {
          message: msg,
          audioSrc: a.src,
          expectedAudioUrl: t?.audioUrl || "(없음)",
          currentTrack: t?.title || "알 수 없음",
          trackId: t?.id || "알 수 없음",
        });
      } else {
        console.error("[PlayerContext] audio error: no error info", {
          audioSrc: a.src,
          expectedAudioUrl: t?.audioUrl || "(없음)",
          currentTrack: t?.title || "알 수 없음",
        });
      }

      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushHistory]);

  // ✅ 볼륨 변경 시 오디오 볼륨 동기화
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = volume;
  }, [volume]);

  // ✅ 재생 로그 기록 (곡이 변경될 때만)
  const lastLoggedTrackRef = useRef<number | null>(null);

  useEffect(() => {
    console.log('🎵 재생 로그 체크:', {
      current_전체: current,
      hasMusicId: !!current?.musicId,
      musicId: current?.musicId,
      isPlaying,
      lastLogged: lastLoggedTrackRef.current,
      조건_통과: !!(current?.musicId && isPlaying),
    });

    if (!current?.musicId || !isPlaying) {
      console.log('❌ 로그 기록 조건 미충족:', {
        reason: !current?.musicId ? 'musicId 없음' : 'isPlaying false',
      });
      return;
    }

    const musicId = current.musicId;

    // 같은 곡이면 로그 기록 안 함 (일시정지 후 재생)
    if (lastLoggedTrackRef.current === musicId) {
      console.log('⏭️ 같은 곡 재생, 로그 스킵:', musicId);
      return;
    }

    // 새로운 곡으로 변경되고 재생될 때만 로그 기록
    console.log('✅ 재생 로그 기록 시도:', musicId);
    lastLoggedTrackRef.current = musicId;
    logPlayTrack(musicId);
  }, [current?.musicId, isPlaying]);

  // ✅ current 변경 시 오디오 src만 동기화
  useEffect(() => {
    const a = audioRef.current;

    const resetReactSide = () => {
      const id = requestAnimationFrame(() => {
        setProgress(0);
        setDuration(0);
      });
      return () => cancelAnimationFrame(id);
    };

    // ✅ 트랙이 변경되면 즉시 이전 오디오 중지 (비동기 로딩 중 'ended' 이벤트 방지)
    if (a) a.pause();

    if (!a || !current) {
      if (a) {
        a.src = "";
        a.load();
      }
      return resetReactSide();
    }

    const loadAudio = async () => {
      let url = current.audioUrl?.trim() ?? "";

      // URL이 "/audio/sample.mp3" 같거나 비어있는데, musicId가 있으면 실제 URL을 가져옴
      const isPlaceholder = url === "/audio/sample.mp3" || !url;
      if (isPlaceholder && current.musicId) {
        try {
          const realUrl = await playTrack(current.musicId);
          if (realUrl) {
            url = realUrl;
            // 상태 업데이트하여 UI 등에도 반영 (선택 사항이지만 권장)
            setCurrent(prev => (prev && prev.id === current.id ? { ...prev, audioUrl: realUrl } : prev));
          }
        } catch (err) {
          console.error("Failed to fetch audio url JIT:", err);
        }
      }

      const ok =
        url &&
        (url.startsWith("http://") ||
          url.startsWith("https://") ||
          url.startsWith("/"));

      if (!ok) {
        a.pause();
        a.src = "";
        a.load();

        // async 함수라 cleanup 반환 불가, 여기서 직접 실행해야 함
        // 하지만 useEffect cleanup이 문제될 수 있음.
        // 여기서는 async 내부 로직이므로 return cleanup을 못함.
        // 일단 상태 리셋만 수행
        return;
      }

      // 상대경로(백엔드 API 경로)를 백엔드 origin 기준 절대 URL로 변환
      // (Player.tsx의 coverUrl 처리와 동일한 패턴)
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
        if (API_BASE && url.startsWith("/")) {
          url = `${API_BASE.replace("/api/v1", "")}${url}`;
        }
      }

      // URL이 변경되었을 때만 src 교체 (재생 중 끊김 방지)
      if (a.src !== url && a.src !== new URL(url, window.location.href).href) {
        a.src = url;
        a.load();
      }

      // 메타데이터 로드 후 길이는 이벤트로 처리됨.
      // resetReactSide는 호출하지 않음 (이전 곡 정보가 잠시 남아있어도 됨, 혹은 명시적으로 0 초기화)
    };

    loadAudio();

    // cleanup: 언마운트 시 처리 (여기서는 간략화)
    return () => {
      // 빠른 트랙 변경 시 race condition 처리는 복잡하므로 
      // 단순히 다음 effect 실행 시 a.src 교체로 해결
    };
  }, [current]);

  // ✅ isPlaying 변경 시 play/pause
  useEffect(() => {
    const a = audioRef.current;

    // 플레이스홀더면 재생 시도 X (JIT fetch 전까지)
    if (!a || !current?.audioUrl || current.audioUrl === "/audio/sample.mp3") return;

    if (isPlaying) {
      const p = a.play();
      if (p) {
        p.catch((e) => {
          if (e?.name === "AbortError") return;
          console.error("[PlayerContext] play failed:", e);
          setIsPlaying(false);
        });
      }
    } else {
      a.pause();
    }
  }, [isPlaying, current]);

  const playList = useCallback(
    (tracks: PlayerTrack[]) => {
      if (tracks.length === 0) return;

      // ✅ 현재 곡이 있었다면 기록에 남김
      const cur = currentRef.current;
      if (cur) pushHistory(cur);

      setCurrent(tracks[0]);
      setIsPlaying(true);
      setProgress(0);
      setQueue(tracks.slice(1));

      // ✅ 새로 재생 시작한 곡도 기록에 포함시키고 싶으면:
      pushHistory(tracks[0]);
    },
    [pushHistory]
  );

  const playListShuffled = useCallback(
    (tracks: PlayerTrack[]) => {
      if (tracks.length === 0) return;
      playList(shuffleCopy(tracks));
    },
    [playList]
  );

  const setTrackAndPlay = useCallback(
    (track: PlayerTrack) => {
      if (!isLoggedIn()) {
        alert("로그인 후 이용 가능합니다.");
        return;
      }

      const cur = currentRef.current;
      if (cur) pushHistory(cur);

      setCurrent(track);
      setIsPlaying(true);
      setProgress(0);

      pushHistory(track);
    },
    [pushHistory]
  );

  const playListAtIndex = useCallback(
    (tracks: PlayerTrack[], index: number) => {
      if (!tracks || tracks.length === 0) return;
      if (index < 0 || index >= tracks.length) return;

      const target = tracks[index];
      const prevTracks = tracks.slice(0, index);
      const nextTracks = tracks.slice(index + 1);

      // ✅ 현재 곡이 있었다면 기록에 남김
      const cur = currentRef.current;
      if (cur) pushHistory(cur);

      setCurrent(target);
      setIsPlaying(true);
      setProgress(0);

      // 큐는 클릭한 곡 '다음'부터
      setQueue(nextTracks);

      // 히스토리는 '이전' 곡들을 역순으로 (가장 최근이 0번 인덱스)
      // + 현재 재생 시작한 곡도 history[0]에 들어가야 함
      // 그래서 [target, ...reversedPrev] 형태가 됨
      setHistory([target, ...prevTracks.reverse()]);
    },
    [pushHistory]
  );

  const playTracks = useCallback(
    (tracks: PlayerTrack[], opts?: { shuffle?: boolean }) => {
      if (tracks.length === 0) return;

      const list = opts?.shuffle ? shuffleCopy(tracks) : tracks;

      const cur = currentRef.current;
      if (cur) pushHistory(cur);

      setCurrent(list[0]);
      setIsPlaying(true);
      setProgress(0);
      setQueue(list.slice(1));

      pushHistory(list[0]);
    },
    [pushHistory]
  );

  type PlayTracksOptions = { shuffle?: boolean };

  // ✅ 큐 뒤에 추가 (현재 재생 유지 + 뒤에 대기열로 붙임)
  const enqueueTracks = useCallback(
    (tracks: PlayerTrack[], opts?: PlayTracksOptions) => {
      if (!tracks || tracks.length === 0) return;

      const incoming = opts?.shuffle ? shuffleCopy(tracks) : tracks;

      const cur = currentRef.current;

      // ✅ 현재 곡이 없으면: 첫 곡을 current로 시작 + 나머지를 queue로
      if (!cur) {
        const [first, ...rest] = incoming;
        if (!first) return;

        setCurrent(first);
        setQueue(rest);
        setIsPlaying(true);
        setProgress(0);

        // (너 정책상) 새로 시작한 곡 history에도 넣고 싶으면
        pushHistory(first);

        return;
      }

      // ✅ 현재 곡이 있으면: queue 맨 뒤에 붙이기
      setQueue((prev) => [...prev, ...incoming]);
    },
    [pushHistory]
  );



  const toggle = useCallback(() => {
    if (!current?.audioUrl) return;
    setIsPlaying((v) => !v);
  }, [current]);

  const seek = useCallback(
    (sec: number) => {
      const a = audioRef.current;
      if (a && current?.audioUrl) {
        a.currentTime = sec;
        setProgress(sec);
      }
    },
    [current]
  );

  const removeFromQueue = useCallback((trackId: string) => {
    setQueue((q) => q.filter((t) => t.id !== trackId));
  }, []);

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((q) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= q.length ||
        toIndex >= q.length
      )
        return q;

      const next = [...q];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const shuffleQueue = useCallback(() => {
    setQueue((q) => shuffleCopy(q));
  }, []);

  const seekBackward = useCallback(
    (seconds: number = 5) => {
      const a = audioRef.current;
      if (a && current?.audioUrl) {
        const newTime = Math.max(0, a.currentTime - seconds);
        a.currentTime = newTime;
        setProgress(newTime);
      }
    },
    [current]
  );

  const seekForward = useCallback(
    (seconds: number = 5) => {
      const a = audioRef.current;
      if (a && current?.audioUrl) {
        const newTime = Math.min(a.duration || duration, a.currentTime + seconds);
        a.currentTime = newTime;
        setProgress(newTime);
      }
    },
    [current, duration]
  );

  const nextTrack = useCallback(() => {
    const cur = currentRef.current;

    setQueue((q) => {
      if (q.length > 0) {
        const next = q[0];

        // ✅ 스킵 시에도 현재곡을 기록에 남김
        if (cur) pushHistory(cur);

        setCurrent(next);
        setProgress(0);
        setIsPlaying(true);
        // ✅ 다음 곡도 기록에 포함시키고 싶으면
        pushHistory(next);

        return q.slice(1);
      }
      return q;
    });
  }, [pushHistory]);

  const previousTrack = useCallback(() => {
    // history 구조: [가장 최근, ...] (current도 history[0]에 들어있음)
    // 이전곡은 history[1]
    if (history.length <= 1) return;

    const cur = currentRef.current; // or 'current' from state
    const prev = history[1];

    // 1. 현재 곡이 있다면 큐의 맨 앞에 다시 추가 (방금 들은 곡이니까)
    if (cur) {
      setQueue((q) => [cur, ...q]);
    }

    // 2. 이전 곡 재생
    setCurrent(prev);
    setProgress(0);
    setIsPlaying(true);

    // 3. History 업데이트 (현재 곡을 History 스택에서 제거 = 이전 상태로 복구)
    // 원래 로직: prev를 맨 앞으로 가져오고 나머지를 유지 -> [B, A, C] (A가 남아서 토글됨)
    // 수정 로직: 맨 앞의 A(현재곡)를 제거 -> [B, C]
    setHistory((h) => h.length > 1 ? h.slice(1) : h);

  }, [history, trackKey]);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "one" : "off"));
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      isPlaying,
      progress,
      duration,
      queue,
      history,

      playList,
      playListShuffled,
      playTracks,
      playListAtIndex,
      enqueueTracks,

      volume,
      setVolume,

      setTrackAndPlay,
      toggle,
      seek,

      removeFromQueue,
      moveQueueItem,

      shuffleQueue,
      seekBackward,
      seekForward,
      nextTrack,
      previousTrack,
      repeatMode,
      toggleRepeat,
    }),
    [
      current,
      isPlaying,
      progress,
      duration,
      queue,
      history,
      playList,
      playListShuffled,
      playTracks,
      playListAtIndex,
      enqueueTracks,
      volume,
      setVolume,
      setTrackAndPlay,
      toggle,
      seek,
      removeFromQueue,
      moveQueueItem,
      shuffleQueue,
      seekBackward,
      seekForward,
      nextTrack,
      previousTrack,
      repeatMode,
      toggleRepeat,
    ]
  );

  return <PlayerContext.Provider
    value={value}>{children}</PlayerContext.Provider>;
}
