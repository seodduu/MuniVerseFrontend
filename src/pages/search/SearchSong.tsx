// src/pages/search/SearchSong.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { createPortal } from "react-dom";

import { IoPlayCircle, IoShuffle } from "react-icons/io5";
import { MdPlaylistAdd, MdFavorite } from "react-icons/md";
import { FaCheckCircle } from "react-icons/fa";

import { usePlayer } from "../../player/PlayerContext";
import type { PlayerTrack } from "../../player/PlayerContext";
import { requireLogin } from "../../api/auth";

import { listMyPlaylists, addPlaylistItem, type PlaylistSummary } from "../../api/playlist";
import { likeTrack } from "../../api/LikedSong";

/* ===================== 타입 ===================== */

type Song = {
  id: string;
  musicId?: number;
  title: string;
  artist: string;
  album: string;
  duration: string;
  isAi?: boolean;
  albumId?: number | null;
  artistId?: number | null;
  albumImage?: string | null;
};

type ApiSearchResult = {
  itunes_id: number;
  music_id: number;
  music_name: string;
  artist_name: string;
  artist_id: number | null;
  album_name: string;
  album_id: number | null;
  duration: number | null;
  is_ai: boolean;
  audio_url: string | null;
  album_image: string | null;
};

type ApiSearchResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ApiSearchResult[];
};

/* ===================== 액션 ===================== */

const actions = [
  { key: "play", label: "재생", icon: <IoPlayCircle size={18} /> },
  { key: "shuffle", label: "셔플", icon: <IoShuffle size={18} /> },
  { key: "add", label: "담기", icon: <MdPlaylistAdd size={18} /> },
  { key: "like", label: "좋아요", icon: <MdFavorite size={18} /> },
] as const;

type ActionKey = (typeof actions)[number]["key"];

/* =====================
  Modal (Portal)
===================== */

function ModalPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function useLockBodyScroll(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function useEscToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
}

function BaseModal({
  open,
  title,
  onClose,
  maxWidthClass = "max-w-[420px]",
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
}) {
  useEscToClose(open, onClose);
  useLockBodyScroll(open);

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[99999] whitespace-normal">
        <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="닫기" />
        <div className="absolute inset-0 grid place-items-center p-6">
          <div
            className={`w-full ${maxWidthClass} rounded-3xl bg-[#3d3d3d] border border-white/10 shadow-2xl overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
              {/* ✅ text-base → text-lg */}
              <div className="text-lg font-semibold text-[#F6F6F6]">{title}</div>
              <button
                type="button"
                onClick={onClose}
                className="text-[#F6F6F6]/70 hover:text-white transition"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ===================== 컴포넌트 ===================== */

export default function SearchSong() {
  const { playTracks, enqueueTracks } = usePlayer();

  const [sp, setSp] = useSearchParams();
  const q = (sp.get("q") ?? "").trim();
  const excludeAi = sp.get("noai") === "1";

  const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const __DEV__ = import.meta.env.DEV;

  // API 데이터 상태
  const [apiSongs, setApiSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 앨범 상세 정보 캐시
  const albumDetailsCacheRef = useRef<
    Record<
      number,
      {
        tracks: Array<{ music_id: number; music_name: string }>;
      }
    >
  >({});

  // 추가: 검색 요청 최신성(runId) 관리
  const searchRunIdRef = useRef(0);

  const toggleExcludeAi = () => {
    const next = new URLSearchParams(sp);
    if (excludeAi) next.delete("noai");
    else next.set("noai", "1");
    setSp(next, { replace: true });
  };


  /* ===================== API 호출 ===================== */

  useEffect(() => {
    if (!API_BASE || !q.trim()) {
      setApiSongs([]);
      setError(null);
      return;
    }

    const runId = ++searchRunIdRef.current;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          q: q,
          exclude_ai: excludeAi ? "true" : "false",
          page_size: "100",
        });

        const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) throw new Error(`API 오류: ${res.status}`);

        const data: ApiSearchResponse = await res.json();

        const converted: Song[] = data.results.map((r) => ({
          id: String(r.music_id),
          musicId: r.music_id,
          title: r.music_name,
          artist: r.artist_name,
          album: r.album_name,
          duration: r.duration
            ? `${Math.floor(r.duration / 60)}:${(r.duration % 60).toString().padStart(2, "0")}`
            : "0:00",
          isAi: r.is_ai,
          albumId: r.album_id,
          artistId: r.artist_id,
          albumImage: r.album_image,
        }));

        if (runId !== searchRunIdRef.current) return; // 최신만 반영
        setApiSongs(converted);
      } catch (e: unknown) {
        if ((e as DOMException)?.name === "AbortError") return;
        console.error("[SearchSong] 검색 API 오류:", e);
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
        setApiSongs([]);
      } finally {
        if (runId === searchRunIdRef.current) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [API_BASE, q, excludeAi]);

  /* ===================== 검색/필터 ===================== */

  const songs = useMemo(() => {
    if (!q.trim()) return [];
    if (!API_BASE) return [];
    return apiSongs.filter((s) => !excludeAi || !s.isAi);
  }, [API_BASE, q, apiSongs, excludeAi]);

  /* ===================== 체크박스 ===================== */

  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const allChecked = songs.length > 0 && songs.every((s) => checkedIds[s.id]);
  const someChecked = songs.some((s) => checkedIds[s.id]) && !allChecked;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const toggleAll = (next: boolean) => {
    const obj: Record<string, boolean> = {};
    songs.forEach((s) => (obj[s.id] = next));
    setCheckedIds(obj);
  };

  const toggleOne = (id: string) => {
    setCheckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /* ===================== 선택 트랙 ===================== */

  const fetchAlbumDetail = useCallback(
    async (albumId: number) => {
      if (!API_BASE) return null;

      if (albumDetailsCacheRef.current[albumId]) return albumDetailsCacheRef.current[albumId];

      try {
        const res = await axios.get<{
          album_id: number;
          tracks: Array<{ music_id: number; music_name: string }>;
        }>(`${API_BASE}/albums/${albumId}/`, {
          headers: { "Content-Type": "application/json" },
        });

        const detail = {
          tracks: res.data.tracks.map((t) => ({ music_id: t.music_id, music_name: t.music_name })),
        };

        albumDetailsCacheRef.current[albumId] = detail;
        return detail;
      } catch (e) {
        console.error(`[SearchSong] 앨범 ${albumId} 상세 정보 가져오기 실패:`, e);
        return null;
      }
    },
    [API_BASE]
  );

  const findMusicId = useCallback(
    async (song: Song): Promise<number | null> => {
      if (song.musicId) return song.musicId;
      if (!song.albumId) return null;

      const albumDetail = await fetchAlbumDetail(song.albumId);
      if (!albumDetail) return null;

      const track = albumDetail.tracks.find((t) => t.music_name === song.title);
      return track ? track.music_id : null;
    },
    [fetchAlbumDetail]
  );

  const fetchTrackAudioUrl = useCallback(
    async (musicId: string): Promise<string | undefined> => {
      if (!API_BASE) return undefined;

      try {
        const res = await axios.get<{ audio_url: string }>(`${API_BASE}/tracks/${musicId}/play`, {
          headers: { "Content-Type": "application/json" },
        });
        return res.data.audio_url;
      } catch (e) {
        console.error(`[SearchSong] 곡 ${musicId} 재생 URL 가져오기 실패:`, e);
        return undefined;
      }
    },
    [API_BASE]
  );

  const toTrack = async (s: Song): Promise<PlayerTrack> => {
    const musicId = await findMusicId(s);

    if (!musicId) {
      return {
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        duration: s.duration,
        audioUrl: undefined,
        coverUrl: undefined,
      };
    }

    const audioUrl = await fetchTrackAudioUrl(String(musicId));

    // API에서 직접 제공하는 album_image 사용
    let coverUrl: string | undefined = undefined;
    const albumImage = s.albumImage;

    if (albumImage) {
      if (albumImage.startsWith("http") || albumImage.startsWith("//")) {
        coverUrl = albumImage;
      } else if (API_BASE && albumImage.startsWith("/")) {
        coverUrl = `${API_BASE.replace("/api/v1", "")}${albumImage}`;
      } else {
        coverUrl = albumImage;
      }
    }

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[SearchSong] track ready`, { id: s.id, musicId, title: s.title, audioUrl, coverUrl, albumImage: s.albumImage });
    }

    return {
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      duration: s.duration,
      audioUrl: audioUrl || undefined,
      coverUrl,
      musicId: musicId || undefined,
      albumId: s.albumId ?? null,
    };
  };

  const checkedSongs = useMemo(() => songs.filter((s) => checkedIds[s.id]), [songs, checkedIds]);
  const selectedCount = checkedSongs.length;

  /* ===================== 담기 모달 ===================== */

  const [addOpen, setAddOpen] = useState(false);
  const [addTargets, setAddTargets] = useState<PlaylistSummary[]>([]);
  const [addTargetsLoading, setAddTargetsLoading] = useState(false);
  const [addTargetsError, setAddTargetsError] = useState<string | null>(null);

  useEffect(() => {
    if (!addOpen) return;

    let cancelled = false;

    (async () => {
      try {
        setAddTargetsLoading(true);
        setAddTargetsError(null);

        const data = await listMyPlaylists();
        if (cancelled) return;

        const filtered = data.filter((p) => p.visibility !== "system");
        setAddTargets(filtered);
      } catch (e) {
        console.error("[SearchSong] 플레이리스트 목록 불러오기 실패:", e);
        if (cancelled) return;

        setAddTargets([]);
        setAddTargetsError(e instanceof Error ? e.message : "플레이리스트 목록을 불러오지 못했어요.");
      } finally {
        if (!cancelled) setAddTargetsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addOpen]);

  const addSelectedToPlaylist = async (playlistId: string) => {
    if (selectedCount === 0) return;

    try {
      const musicIds = (await Promise.all(checkedSongs.map(findMusicId))).filter(
        (id): id is number => typeof id === "number"
      );
      const unique = Array.from(new Set(musicIds));
      if (unique.length === 0) return;

      const results = await Promise.allSettled(
        unique.map(async (id) => {
          try {
            await addPlaylistItem(playlistId, id);
            return { id, ok: true };
          } catch (e) {
            if (axios.isAxiosError(e)) {
              const status = e.response?.status;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const msg = (e.response?.data as any)?.error || (e.response?.data as any)?.message || "";

              const isAlready =
                status === 409 ||
                (status === 400 && typeof msg === "string" && msg.includes("이미 플레이리스트에 추가된 곡"));

              if (isAlready) {
                return { id, ok: true, already: true };
              }
            }
            throw e;
          }
        })
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fulfilled = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<any>).value);

      const already = fulfilled.filter((v) => v?.already).length;
      const ok = fulfilled.filter((v) => v?.ok && !v?.already).length;
      const fail = results.length - (ok + already);

      alert(
        fail === 0
          ? already > 0
            ? `담기 완료: ${ok}곡 / 이미 담김: ${already}곡`
            : `담기 완료: ${ok}곡`
          : `담기 완료: ${ok}곡 / 실패: ${fail}곡${already > 0 ? ` / 이미 담김: ${already}곡` : ""}`
      );

      setAddOpen(false);
      setCheckedIds({});
    } catch (e) {
      console.error("[SearchSong] 플레이리스트 담기 실패:", e);
      alert("플레이리스트에 담기 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  const addSelectedToLiked = async () => {
    if (selectedCount === 0) return;

    try {
      const musicIds = (await Promise.all(checkedSongs.map(findMusicId))).filter(
        (id): id is number => typeof id === "number"
      );
      const unique = Array.from(new Set(musicIds));
      if (unique.length === 0) return;

      const results = await Promise.allSettled(
        unique.map(async (id) => {
          try {
            await likeTrack(id);
            return { id, ok: true };
          } catch (e) {
            if (axios.isAxiosError(e) && e.response?.status === 409) {
              return { id, ok: true, already: true };
            }
            throw e;
          }
        })
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;

      setCheckedIds({});

      if (fail === 0) alert(`좋아요 완료: ${ok}곡`);
      else alert(`좋아요 완료: ${ok}곡 / 실패: ${fail}곡`);
    } catch (e) {
      console.error("[SearchSong] 좋아요 실패:", e);
      alert("좋아요 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  /* ===================== 액션 ===================== */

  type PendingPlay = {
    key: ActionKey;
    tracks: PlayerTrack[];
  };

  const [playConfirmOpen, setPlayConfirmOpen] = useState(false);
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);

  const handleAction = async (key: ActionKey) => {
    if (!requireLogin("로그인 후 이용 가능합니다.")) return;
    if (selectedCount === 0) return;

    if (key === "play" || key === "shuffle") {
      const playerTracks = await Promise.all(checkedSongs.map(toTrack));
      setPendingPlay({ key, tracks: playerTracks });
      setPlayConfirmOpen(true);
      return;
    }
    if (key === "add") {
      setAddOpen(true);
      return;
    }
    if (key === "like") {
      await addSelectedToLiked();
      return;
    }
  };

  const handleRowDoubleClick = async (song: Song) => {
    if (!requireLogin("로그인 후 이용 가능합니다.")) return;
    try {
      const track = await toTrack(song);
      if (!track.audioUrl) return;
      playTracks([track]);
    } catch (e) {
      console.error("[SearchSong] 행 더블클릭 재생 중 오류:", e);
    }
  };

  const runPendingPlay = (mode: "replace" | "enqueue") => {
    if (!pendingPlay) return;

    const isShuffle = pendingPlay.key === "shuffle";

    if (mode === "replace") playTracks(pendingPlay.tracks, { shuffle: isShuffle });
    else enqueueTracks(pendingPlay.tracks, { shuffle: isShuffle });

    setCheckedIds({});
    setPendingPlay(null);
    setPlayConfirmOpen(false);
  };

  /* ===================== JSX ===================== */

  return (
    <>
      <section className="mt-4 rounded-[40px] bg-white/[0.05] backdrop-blur-2xl border border-white/10 overflow-hidden">
        {/* 헤더 */}
        <div className="px-8 pt-8 pb-6 border-b border-white/10 overflow-x-auto whitespace-nowrap no-scrollbar">
          <div className="flex items-end justify-between">
            <div className="flex items-center gap-4">
              {/* ✅ text-xl → text-2xl */}
              <h2 className="text-2xl font-bold text-[#F6F6F6]">곡</h2>
              {loading ? (
                // ✅ text-sm → text-base
                <div className="text-base text-white/40">검색 중...</div>
              ) : error ? (
                // ✅ text-sm → text-base
                <div className="text-base text-red-400">오류: {error}</div>
              ) : (
                // ✅ text-sm → text-base
                <div className="text-base text-white/40">총 {songs.length}곡</div>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={toggleExcludeAi}
              className={[
                // ✅ text-sm → text-base
                "shrink-0 px-4 py-2 rounded-2xl transition-all text-base flex items-center gap-2.5 border border-[#f6f6f6]/10",
                excludeAi
                  ? "border-[#AFDEE2] text-[#AFDEE2]"
                  : "text-[#f6f6f6]/80 hover:bg-[#f6f6f6]/10 hover:text-[#f6f6f6] hover:border-[#f6f6f6]/20",
              ].join(" ")}
            >
              <FaCheckCircle size={15} />
              AI 제외
            </button>

            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={selectedCount === 0}
                onClick={() => handleAction(a.key)}
                className={[
                  // ✅ text-sm → text-base
                  "px-4 py-2 rounded-2xl border border-[#f6f6f6]/10 text-base flex items-center gap-2.5 transition",
                  selectedCount === 0
                    ? "text-[#f6f6f6]/20 border-[#f6f6f6]/5 cursor-not-allowed"
                    : "text-[#f6f6f6]/80 hover:bg-[#f6f6f6]/10 hover:text-[#f6f6f6] hover:border-[#f6f6f6]/20",
                ].join(" ")}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* 리스트 헤더 */}
        <div className="px-4 pt-4 border-b border-white/10">
          {/* ✅ text-xs → text-sm */}
          <div className="px-4 grid grid-cols-[28px_56px_1fr_90px] gap-x-4 pb-3 text-sm text-[#f6f6f6]/60">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="accent-[#f6f6f6] cursor-pointer"
              checked={allChecked}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            <div className="col-span-2 px-2 border-l border-white/10">곡정보</div>
            <div className="text-right px-2 border-r border-white/10">길이</div>
          </div>
        </div>

        {/* 리스트 */}
        <div className="divide-y divide-white/10">
          {loading && songs.length === 0 ? (
            // ✅ text-center text-white/20 그대로, text-base로 업
            <div className="px-6 py-12 text-center text-base text-white/20">검색 중...</div>
          ) : error && songs.length === 0 ? (
            <div className="px-6 py-12 text-center text-base text-red-400">오류가 발생했습니다: {error}</div>
          ) : songs.length === 0 ? (
            <div className="px-6 py-8 text-center text-base text-white/20">
              {q ? "검색 결과 없음" : "검색어를 입력해주세요"}
            </div>
          ) : (
            songs.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[28px_56px_1fr_90px] items-center gap-x-3 px-8 py-2 hover:bg-white/5 transition cursor-pointer group"
                onDoubleClick={() => handleRowDoubleClick(s)}
              >
                <input
                  type="checkbox"
                  className="accent-[#f6f6f6]"
                  checked={!!checkedIds[s.id]}
                  onChange={() => toggleOne(s.id)}
                  onClick={(e) => e.stopPropagation()}
                />

                {/* 앨범 이미지 */}
                <div className="ml-2 w-12 h-12 rounded-xl bg-white/5 overflow-hidden relative flex-shrink-0 shadow-lg">
                  {(() => {
                    // API에서 직접 제공하는 album_image 사용
                    const albumImage = s.albumImage;

                    const src =
                      albumImage && (albumImage.startsWith("http") || albumImage.startsWith("//"))
                        ? albumImage
                        : albumImage && API_BASE && albumImage.startsWith("/")
                          ? `${API_BASE.replace("/api/v1", "")}${albumImage}`
                          : albumImage || "";

                    return albumImage ? (
                      <>
                        <img
                          src={src}
                          alt={s.title}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover relative z-10"
                          onError={(e) => {
                            if (__DEV__) {
                              // eslint-disable-next-line no-console
                              console.error("[SearchSong] ❌ 곡 앨범 이미지 로드 실패:", {
                                song: s.title,
                                album_id: s.albumId,
                                image_url: albumImage,
                              });
                            }
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                          onLoad={(e) => {
                            const img = e.target as HTMLImageElement;
                            const fallback = img.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = "none";
                          }}
                          loading="lazy"
                          decoding="async"
                          fetchPriority="low"
                        />
                        <div className="absolute inset-0 bg-white/5 animate-pulse z-0" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-white/5" />
                    );
                  })()}
                </div>

                <div className="min-w-0">
                  {/* ✅ text-base → text-lg */}
                  <div className="ml-1 text-base text-[#f6f6f6] truncate group-hover:text-[#AFDEE2] transition-colors">
                    {s.title}
                    {s.isAi && (
                      <span className="shrink-0 ml-3 text-xs font-black px-2 py-0.5 rounded-full bg-[#E4524D]/20 text-[#E4524D] border border-[#E4524D]/20 uppercase">
                        AI
                      </span>
                    )}
                  </div>
                  {/* ✅ text-xs → text-sm */}
                  <div className="ml-1 text-sm text-white/30 truncate">{s.artist}</div>
                </div>

                {/* ✅ text-sm → text-base */}
                <div className="mr-1 text-base text-white/70 text-right group-hover:text-[#AFDEE2]/70 transition-colors">
                  {s.duration}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ✅ 담기 모달 (Portal) */}
      <BaseModal open={addOpen} onClose={() => setAddOpen(false)} title="플레이리스트 선택" maxWidthClass="max-w-[420px]">
        {/* ✅ text-sm → text-base */}
        <div className="px-6 py-4 text-base text-[#F6F6F6]/70">
          선택한 {selectedCount}곡을 담을 플레이리스트를 골라주세요
        </div>

        <div className="max-h-[360px] overflow-y-auto border-t border-white/10">
          {addTargetsLoading ? (
            // ✅ text-sm → text-base
            <div className="px-6 py-6 text-base text-[#aaa]">플레이리스트 불러오는 중...</div>
          ) : addTargetsError ? (
            // ✅ text-sm → text-base
            <div className="px-6 py-6 text-base text-red-400">오류: {addTargetsError}</div>
          ) : addTargets.length === 0 ? (
            // ✅ text-sm → text-base
            <div className="px-6 py-6 text-base text-[#aaa]">담을 수 있는 플레이리스트가 없어요.</div>
          ) : (
            addTargets.map((p) => (
              <button
                key={p.playlist_id}
                type="button"
                onClick={() => addSelectedToPlaylist(p.playlist_id.toString())}
                className="w-full text-left px-6 py-4 hover:bg-white/5 transition border-b border-white/10"
              >
                {/* ✅ text-sm → text-base */}
                <div className="text-base font-semibold text-[#F6F6F6] truncate">{p.title}</div>
                {/* ✅ text-xs → text-sm */}
                <div className="mt-1 text-xs text-[#F6F6F6]/60 truncate">
                  {p.creator_nickname} · {p.visibility === "public" ? "공개" : "비공개"}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end">
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            // ✅ text-sm → text-base
            className="px-4 py-2 rounded-2xl text-base text-[#F6F6F6] hover:bg-white/10 transition"
          >
            취소
          </button>
        </div>
      </BaseModal>

      {/* ✅ 재생 방식 선택 모달 (Portal) */}
      <BaseModal
        open={playConfirmOpen && !!pendingPlay}
        onClose={() => {
          setPlayConfirmOpen(false);
          setPendingPlay(null);
        }}
        title="재생 방식 선택"
        maxWidthClass="max-w-[440px]"
      >
        {pendingPlay && (
          <>
            {/* ✅ text-sm → text-base */}
            <div className="px-6 py-4 text-base text-[#F6F6F6]/70">
              선택한 {pendingPlay.tracks.length}곡을 {pendingPlay.key === "shuffle" ? "셔플로 " : ""}어떻게 재생할까요?
            </div>

            <div className="px-6 pb-6 grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => runPendingPlay("replace")}
                // ✅ text-sm → text-base
                className="w-full px-4 py-3 rounded-2xl text-base text-[#F6F6F6] outline outline-1 outline-white/10 hover:bg-white/10 transition text-left"
              >
                <div className="font-semibold text-[#afdee2]">현재 재생 대기목록 지우고 재생</div>
                {/* ✅ text-xs → text-sm */}
                <div className="mt-1 text-xs text-[#999]">
                  지금 재생 대기목록을 초기화하고 선택한 곡들로 새로 재생합니다.
                </div>
              </button>

              <button
                type="button"
                onClick={() => runPendingPlay("enqueue")}
                // ✅ text-sm → text-base
                className="w-full px-4 py-3 rounded-2xl text-base text-[#F6F6F6] outline outline-1 outline-white/10 hover:bg-white/10 transition text-left"
              >
                <div className="font-semibold text-[#afdee2]">재생 대기목록 맨 뒤에 추가</div>
                {/* ✅ text-xs → text-sm */}
                <div className="mt-1 text-xs text-[#999]">
                  현재 재생은 유지하고, 선택한 곡들을 재생 대기 목록 마지막에 둡니다.
                </div>
              </button>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setPlayConfirmOpen(false);
                  setPendingPlay(null);
                }}
                // ✅ text-sm → text-base
                className="px-4 py-2 rounded-2xl text-base text-[#F6F6F6] hover:bg-white/10 transition"
              >
                취소
              </button>
            </div>
          </>
        )}
      </BaseModal>
    </>
  );
}
