
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MdOutlineNavigateNext, MdPlayArrow } from "react-icons/md";
import { usePlayer } from "../../player/PlayerContext";
import type { PlayerTrack } from "../../player/PlayerContext";

/* =====================
  Horizontal Scroller (규격 통일)
===================== */
type HorizontalScrollerProps = {
  children: React.ReactNode;
  scrollStep?: number;
  gradientFromClass?: string;
};

function HorizontalScroller({
  children,
  scrollStep = 300,
  gradientFromClass = "from-[#2d2d2d]/80",
}: HorizontalScrollerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;

    const can = el.scrollWidth > el.clientWidth + 1;
    setCanScroll(can);

    if (!can) {
      setShowLeft(false);
      setShowRight(false);
      return;
    }

    const left = el.scrollLeft;
    const max = el.scrollWidth - el.clientWidth;

    setShowLeft(left > 4);
    setShowRight(left < max - 4);
  };

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative mt-2">
      <div ref={ref} onScroll={update} className="overflow-x-auto overflow-y-hidden no-scrollbar">
        {children}
      </div>

      {canScroll && showLeft && (
        <button
          type="button"
          onClick={() => {
            ref.current?.scrollBy({ left: -scrollStep, behavior: "smooth" });
            setTimeout(update, 250);
          }}
          className="
            absolute left-1 top-1/2 -translate-y-1/2 z-10
            h-9 w-9 rounded-full
            bg-[#1d1d1d]/50 text-[#f6f6f6]
            flex items-center justify-center
            hover:bg-[#1d1d1d]/70 transition
          "
          aria-label="왼쪽으로 이동"
        >
          <MdOutlineNavigateNext className="rotate-180" size={22} />
        </button>
      )}

      {canScroll && showRight && (
        <button
          type="button"
          onClick={() => {
            ref.current?.scrollBy({ left: scrollStep, behavior: "smooth" });
            setTimeout(update, 250);
          }}
          className="
            absolute right-1 top-1/2 -translate-y-1/2 z-10
            h-9 w-9 rounded-full
            bg-[#1d1d1d]/50 text-[#f6f6f6]
            flex items-center justify-center
            hover:bg-[#1d1d1d]/70 transition
          "
          aria-label="오른쪽으로 이동"
        >
          <MdOutlineNavigateNext size={22} />
        </button>
      )}

      {canScroll && showRight && (
        <div
          className={[
            "pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l to-transparent",
            gradientFromClass,
          ].join(" ")}
        />
      )}
      {canScroll && showLeft && (
        <div
          className={[
            "pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r to-transparent",
            gradientFromClass,
          ].join(" ")}
        />
      )}
    </div>
  );
}

/* =====================
  Types
===================== */
type Song = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  albumId?: number | null;
  artistId?: number | null;
  albumName?: string;
  image?: string | null;
  audioUrl?: string | null;
  musicId?: number | null;
};
type Artist = { id: string; name: string; image?: string | null };
type Album = { id: string; name: string; artist: string; image?: string | null };

type ArtistDetail = {
  artist_id: number;
  artist_name: string;
  artist_image: string | null;
};

type ApiSearchResult = {
  itunes_id: number;
  music_id?: number;
  music_name: string;
  artist_name: string;
  artist_id: number | null;
  album_name: string;
  album_id: number | null;
  duration: number | null;
  is_ai: boolean;
  audio_url: string | null;
  album_image: string | null;
  related_artists?: RelatedArtist[];
};

type RelatedArtist = {
  artist_id: number;
  artist_name: string;
  artist_image: string | null;
};

type ApiSearchResponse = {
  count: number;
  results: ApiSearchResult[];
  related_artists?: RelatedArtist[];
};

type ArtistAlbum = {
  id: string;
  title: string;
  year: string;
  album_image: string | null;
  image_large_square: string | null;
};

/* =====================
  UI Helpers (규격 통일)
===================== */
function SkeletonBox({ className = "" }: { className?: string }) {
  return <div className={["animate-pulse bg-white/10", className].join(" ")} />;
}

function EmptyText({ children }: { children: React.ReactNode }) {
  // ✅ text-sm → text-base
  return <div className="text-base text-[#F6F6F6]/55">{children}</div>;
}

function SectionShell({
  title,
  onMore,
  children,
}: {
  title: string;
  onMore?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[40px] bg-white/[0.05] backdrop-blur-2xl border border-white/10">
      <div className="px-8 pt-6 pb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onMore}
          // ✅ text-lg → text-xl
          className="text-2xl font-bold hover:text-[#f6f6f6]/50 text-[#F6F6F6]"
        >
          {title}
        </button>

        <button
          type="button"
          onClick={onMore}
          // ✅ text-xl 유지(이미 큼). 아이콘만 한 단계 업
          className="text-[#F6F6F6] hover:text-[#f6f6f6]/50 transition text-xl leading-none"
          aria-label={`${title} 더보기`}
          title="더보기"
        >
          <MdOutlineNavigateNext size={34} />
        </button>
      </div>

      <div className="mb-4 mx-4 border-b border-white/10" />
      <div className="px-6 pb-6">{children}</div>
    </section>
  );
}

/* =====================
  Main
===================== */
export default function SearchHome() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const { setTrackAndPlay } = usePlayer();

  const q = (sp.get("q") ?? "").trim();
  const search = q ? `?q=${encodeURIComponent(q)}` : "";
  const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

  const [apiSongs, setApiSongs] = useState<Song[]>([]);
  const [apiArtists, setApiArtists] = useState<Artist[]>([]);
  const [relatedArtists, setRelatedArtists] = useState<Artist[]>([]);
  const [apiAlbums, setApiAlbums] = useState<ArtistAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [artistDetails, setArtistDetails] = useState<Record<number, ArtistDetail>>({});


  const fetchArtistDetails = useCallback(
    async (artistIds: number[]) => {
      if (!API_BASE) return;
      const detailsMap: Record<number, ArtistDetail> = {};
      try {
        const promises = artistIds.map(async (artistId) => {
          try {
            const url = `${API_BASE}/artists/${artistId}/`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data: ArtistDetail = await res.json();
            return { artistId, data };
          } catch {
            return null;
          }
        });
        const results = await Promise.all(promises);
        results.forEach((r) => {
          if (r) detailsMap[r.artistId] = r.data;
        });
        setArtistDetails(detailsMap);
      } catch (e) {
        console.error(e);
      }
    },
    [API_BASE]
  );

  const fetchArtistAlbums = useCallback(
    async (artistIds: number[]) => {
      if (!API_BASE) return;
      const allAlbums: ArtistAlbum[] = [];
      const seenAlbumIds = new Set<string>();
      try {
        const promises = artistIds.map(async (artistId) => {
          try {
            const url = `${API_BASE}/artists/${artistId}/albums/`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const data: ArtistAlbum[] = await res.json();
            return { artistId, albums: data };
          } catch {
            return null;
          }
        });
        const results = await Promise.all(promises);
        results.forEach((r) => {
          if (!r) return;
          r.albums.forEach((album) => {
            if (!seenAlbumIds.has(album.id)) {
              seenAlbumIds.add(album.id);
              allAlbums.push(album);
            }
          });
        });
        setApiAlbums(allAlbums);
      } catch (e) {
        console.error(e);
      }
    },
    [API_BASE]
  );

  useEffect(() => {
    if (!API_BASE || !q.trim()) {
      setApiSongs([]);
      setApiArtists([]);
      setRelatedArtists([]);
      setApiAlbums([]);

      setArtistDetails({});
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ q, page_size: "30" });
        const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`API 오류: ${res.status}`);
        const data: ApiSearchResponse = await res.json();


        const convertedSongs: Song[] = data.results.map((r) => ({
          id: String(r.itunes_id),
          title: r.music_name,
          artist: r.artist_name,
          duration: r.duration
            ? `${Math.floor(r.duration / 60)}:${(r.duration % 60).toString().padStart(2, "0")}`
            : "0:00",
          albumId: r.album_id,
          artistId: r.artist_id,
          albumName: r.album_name,
          image: r.album_image,
          audioUrl: r.audio_url,
          musicId: r.music_id,
        }));

        const artistMap = new Map<number, Artist>();
        data.results.forEach((r) => {
          if (r.artist_id && !artistMap.has(r.artist_id)) {
            artistMap.set(r.artist_id, { id: String(r.artist_id), name: r.artist_name });
          }
        });

        setApiSongs(convertedSongs);
        setApiArtists(Array.from(artistMap.values()));

        if (data.related_artists) {
          const related = data.related_artists.map((ra) => ({
            id: String(ra.artist_id),
            name: ra.artist_name,
            image: ra.artist_image,
          }));
          setRelatedArtists(related);
        } else {
          setRelatedArtists([]);
        }

        const uniqueArtistIds = Array.from(
          new Set(data.results.map((r) => r.artist_id).filter((id): id is number => id !== null))
        ).slice(0, 8);

        if (uniqueArtistIds.length > 0) {
          await Promise.all([fetchArtistAlbums(uniqueArtistIds), fetchArtistDetails(uniqueArtistIds)]);
        }
      } catch (e: unknown) {
        if ((e as DOMException)?.name !== "AbortError") console.error(e);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [API_BASE, q, fetchArtistAlbums, fetchArtistDetails]);

  const artists = useMemo(() => {
    // 1. API 검색 결과에서 나온 아티스트들 (이미지는 artistDetails에 의존)
    const fromSearch = apiArtists.map((a) => ({
      ...a,
      image: artistDetails[Number(a.id)]?.artist_image || null,
    }));

    // 2. related_artists (이미지가 이미 포함됨)
    const fromRelated = relatedArtists;

    // 3. 중복 제거 및 합치기 (id 기준)
    const map = new Map<string, Artist>();

    // 검색 결과 아티스트 우선 넣기
    fromSearch.forEach((a) => map.set(a.id, a));

    // 연관 아티스트 넣기 (이미 있으면 스킵하거나, 이미지가 있는 쪽을 선호할 수도 있음. 
    // 여기서는 연관 아티스트에 이미지가 확실히 있다면 덮어쓰거나, 없는 경우만 넣는 로직 등을 고려)
    // 보통 검색 결과가 더 direct match일 수 있으나, related_artists 정보가 더 풍부할 수도 있음(이미지 등).
    // User request implies related_artists has images. 
    fromRelated.forEach((a) => {
      if (!map.has(a.id)) {
        map.set(a.id, a);
      } else {
        // 이미 존재하는데 이미지가 없다면 related data의 이미지로 채워주기
        const existing = map.get(a.id)!;
        if (!existing.image && a.image) {
          map.set(a.id, { ...existing, image: a.image });
        }
      }
    });

    return Array.from(map.values());
  }, [apiArtists, artistDetails, relatedArtists]);

  const albums = useMemo<Album[]>(
    () =>
      apiAlbums.map((a) => ({
        id: a.id,
        name: a.title,
        artist: "",
        image: a.image_large_square || a.album_image,
      })),
    [apiAlbums]
  );

  const featured = useMemo(() => {
    if (!q.trim()) return null;
    const lower = q.toLowerCase().trim();
    const exact = artists.find((a) => a.name.toLowerCase().trim() === lower);
    if (exact) return { type: "artist" as const, data: exact };
    if (artists.length > 0) return { type: "artist" as const, data: artists[0] };
    if (apiSongs.length > 0) return { type: "song" as const, data: apiSongs[0] };
    return null;
  }, [q, artists, apiSongs]);

  const resolveImage = (url: string) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("//")) return url;
    if (API_BASE && url.startsWith("/")) return `${API_BASE.replace("/api/v1", "")}${url}`;
    return url;
  };



  const songToTrack = (s: Song): PlayerTrack => ({
    id: s.id,
    musicId: s.musicId || Number(s.id),
    title: s.title,
    artist: s.artist,
    coverUrl: s.image || "",
    audioUrl: s.audioUrl || "/audio/sample.mp3",
    duration: s.duration,
  });

  const hasQuery = !!q.trim();
  const canUseApi = !!API_BASE;

  return (
    <div className="w-full min-w-0 h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto py-4">
        <div className="space-y-4">
          {/* 안내 섹션 규격 통일 */}
          {(!hasQuery || !canUseApi) && (
            <section className="rounded-[40px] bg-white/[0.05] backdrop-blur-2xl border border-white/10 p-8">
              {/* ✅ text-lg → text-xl */}
              <div className="text-xl font-semibold text-[#F6F6F6]">
                {canUseApi ? "검색어를 입력해주세요" : "API_BASE 설정이 필요해요"}
              </div>
              {/* ✅ text-sm → text-base */}
              <div className="mt-2 text-base text-[#F6F6F6]/60">
                {canUseApi
                  ? "노래, 아티스트 또는 앨범을 입력하여 취향을 찾아보세요."
                  : "VITE_API_BASE_URL 환경변수를 설정해야 검색 API를 호출할 수 있습니다."}
              </div>
            </section>
          )}

          {/* ✅ 상단 2열 규격 통일 */}
          <div className="overflow-x-auto">
            <div className="grid gap-4 grid-cols-[minmax(320px,0.8fr)_minmax(520px,1.2fr)] min-w-[920px]">
              {/* 상위 결과 카드 */}
              <section className="rounded-[40px] bg-white/[0.05] backdrop-blur-2xl border border-white/10 overflow-hidden">
                <div className="px-8 pt-6 pb-3 flex items-center justify-between">
                  {/* ✅ text-lg → text-xl */}
                  <div className="text-2xl font-bold text-[#F6F6F6]">상위 결과</div>
                </div>
                <div className="mx-4 border-b border-white/10" />

                <div className="p-4">
                  <div className="group relative h-full w-full rounded-3xl hover:bg-[#1d1d1d]/45 transition p-4">
                    {loading ? (
                      hasQuery && (
                        <div className="flex flex-col">
                          <SkeletonBox className="w-[228px] h-[228px] rounded-2xl" />
                          <SkeletonBox className="mt-5 h-5 w-44 rounded-md" />
                          <SkeletonBox className="mt-2 h-4 w-28 rounded-md" />
                        </div>
                      )
                    ) : !featured ? (
                      <div className="flex flex-col">
                        <div className="w-[228px] h-[228px] bg-white/10 rounded-2xl" />
                        <div className="mt-5 min-w-0">
                          {/* ✅ text-lg → text-xl */}
                          <div className="text-xl font-semibold text-[#F6F6F6] truncate">
                            {hasQuery ? "검색 결과 없음" : "검색어를 입력해주세요"}
                          </div>
                          {/* ✅ text-sm → text-base */}
                          <div className="mt-1 text-base text-[#F6F6F6]/60 truncate">
                            {hasQuery ? "다른 키워드로 다시 검색해주세요" : "상단 검색창에 검색어를 입력해보세요"}
                          </div>
                        </div>
                      </div>
                    ) : (() => {
                      const isArtist = featured.type === "artist";
                      const data = featured.data;

                      // If it's a song, we have the full data in `data` (Song type).
                      // If it's an artist, we might want to play the first song of artist? 
                      // Wait, original logic for artist played the first song of searchResults corresponding to apiSongs[0]? 
                      // "const firstSong = searchResults.find((x) => String(x.itunes_id) === apiSongs[0].id);"
                      // This implies play the top song if artist is featured? That seems weird but okay.
                      // Let's stick to fixing the Song case. The Song case uses `r`. I want to use `data` directly.

                      const img = isArtist ? (data as Artist).image : (data as Song).image;

                      return (
                        <div className="flex flex-col">
                          <div
                            className={[
                              "w-[228px] h-[228px] bg-[#3d3d3d]/10 relative overflow-hidden",
                              isArtist ? "rounded-full" : "rounded-2xl",
                            ].join(" ")}
                          >
                            {img ? (
                              <img
                                src={resolveImage(img)}
                                alt={isArtist ? (data as Artist).name : (data as Song).title}
                                width={228}
                                height={228}
                                className="w-full h-full object-cover"
                                loading="eager"
                                fetchPriority="high"
                                decoding="async"
                              />
                            ) : (
                              <div className="w-full h-full bg-white/10" />
                            )}

                            <div className="absolute inset-0 bg-[#4d4d4d]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                          </div>

                          <div className="mt-5 min-w-0">
                            {/* ✅ text-lg → text-xl */}
                            <div className="text-2xl font-bold text-[#F6F6F6] truncate">
                              {isArtist ? (data as Artist).name : (data as Song).title}
                            </div>
                            {/* ✅ text-sm → text-base */}
                            <div className="mt-1 text-base text-[#F6F6F6]/60 truncate">
                              {isArtist ? "아티스트" : (data as Song).artist}
                            </div>
                          </div>

                          {((!isArtist) || (isArtist && apiSongs.length > 0)) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isArtist) {
                                  setTrackAndPlay(songToTrack(data as Song));
                                } else if (isArtist && apiSongs.length > 0) {
                                  // For artist, it plays the first returned song? 
                                  const firstSong = apiSongs[0];
                                  if (firstSong) setTrackAndPlay(songToTrack(firstSong));
                                }
                              }}
                              className="
                                absolute right-0 bottom-4
                                -translate-x-4 -translate-y-4
                                w-14 h-14 rounded-full
                                bg-[#AFDEE2] text-[#1d1d1d]
                                grid place-items-center
                                shadow-lg
                                hover:bg-[#87B2B6] transition
                                opacity-0 translate-y-1 pointer-events-none
                                group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto
                              "
                              aria-label="재생"
                              title="재생"
                            >
                              <MdPlayArrow size={26} />
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </section>

              {/* 곡 리스트 카드: 규격 통일 */}
              <section className="rounded-[40px] bg-white/[0.05] backdrop-blur-2xl border border-white/10 overflow-hidden">
                <div className="px-8 pt-6 pb-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(`/search/song${search}`)}
                    // ✅ text-lg → text-xl
                    className="text-2xl font-bold hover:text-[#f6f6f6]/50 text-[#F6F6F6]"
                  >
                    곡
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/search/song${search}`)}
                    className="text-[#F6F6F6] hover:text-[#f6f6f6]/50 transition text-2xl leading-none"
                    aria-label="곡 더보기"
                    title="더보기"
                  >
                    <MdOutlineNavigateNext size={34} />
                  </button>
                </div>

                <div className="mx-4 border-b border-white/10" />

                <div className="px-4">
                  {loading && hasQuery ? (
                    <div className="">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="w-full px-2 py-3 border-b border-white/10 last:border-b-0">
                          <div className="flex items-center gap-4">
                            <SkeletonBox className="h-12 w-12 rounded-xl" />
                            <div className="min-w-0 flex-1">
                              <SkeletonBox className="h-4 w-48 rounded-md" />
                              <SkeletonBox className="mt-2 h-3 w-28 rounded-md" />
                            </div>
                            <SkeletonBox className="h-4 w-10 rounded-md" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : apiSongs.length === 0 ? (
                    <div className="px-4 py-6">
                      <EmptyText>{hasQuery ? "해당 검색어의 곡이 없습니다." : "검색어를 입력하면 곡이 표시됩니다."}</EmptyText>
                    </div>
                  ) : (
                    apiSongs.slice(0, 4).map((s) => {
                      const albumImage = s.image ?? null;

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setTrackAndPlay(songToTrack(s))}
                          className="w-full text-left px-2 py-3 hover:bg-white/5 transition border-b border-white/10 last:border-b-0"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-white/10 overflow-hidden relative flex-shrink-0">
                              {albumImage ? (
                                <img
                                  src={resolveImage(albumImage)}
                                  alt={s.title}
                                  width={48}
                                  height={48}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full bg-white/10" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              {/* ✅ text-sm → text-base */}
                              <div className="truncate text-base font-semibold text-[#F6F6F6]">{s.title}</div>
                              {/* ✅ text-xs → text-sm */}
                              <div className="truncate text-sm text-[#F6F6F6]/60">{s.artist}</div>
                            </div>
                            {/* ✅ text-sm 유지/업: text-base */}
                            <div className="w-12 text-right text-base text-[#F6F6F6]/70 tabular-nums">
                              {s.duration}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex justify-center border-t border-white/10 p-4 text-[#D9D9D9]">
                  <button
                    type="button"
                    onClick={() => navigate(`/search/song${search}`)}
                    aria-label="곡 더보기"
                    title="더보기"
                    // ✅ text-xs → text-sm
                    className="text-sm text-[#f6f6f6]/40 hover:text-[#aaaaaa] transition"
                    disabled={!hasQuery}
                  >
                    더보기
                  </button>
                </div>
              </section>
            </div>
          </div>

          {/* 아티스트: 규격 통일 */}
          <SectionShell title="아티스트" onMore={() => navigate(`/search/artist${search}`)}>
            {loading && hasQuery ? (
              <HorizontalScroller gradientFromClass="from-[#2d2d2d]/80">
                <div className="flex gap-4 min-w-max px-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-[220px] text-left shrink-0">
                      <SkeletonBox className="w-[208px] h-[208px] ml-2 rounded-full" />
                      <SkeletonBox className="mt-3 ml-2 h-4 w-32 rounded-md" />
                      <SkeletonBox className="mt-2 ml-2 h-3 w-16 rounded-md" />
                    </div>
                  ))}
                </div>
              </HorizontalScroller>
            ) : artists.length === 0 ? (
              <div className="px-2">
                <EmptyText>{hasQuery ? "해당 검색어의 아티스트가 없습니다." : "검색어를 입력하면 아티스트가 표시됩니다."}</EmptyText>
              </div>
            ) : (
              <HorizontalScroller gradientFromClass="from-[#2d2d2d]/80">
                <div className="flex gap-4 min-w-max px-2">
                  {artists.slice(0, 8).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => navigate(`/artists/${a.id}`)}
                      className="w-[220px] text-left group shrink-0"
                    >
                      <div
                        className="
                          w-[208px] h-[208px] ml-2 rounded-full
                          bg-white/10 overflow-hidden relative
                          transition-all duration-700 ease-out
                          group-hover:shadow-[0_16px_28px_rgba(0,0,0,0.55)]
                        "
                      >
                        {a.image ? (
                          <img
                            src={resolveImage(a.image)}
                            alt={a.name}
                            width={208}
                            height={208}
                            className="
                              w-full h-full object-cover
                              transition-all duration-1000
                              opacity-90 brightness-95
                              group-hover:scale-[1.15]
                              group-hover:opacity-100
                              group-hover:brightness-110
                            "
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-white/10" />
                        )}
                      </div>

                      {/* ✅ text-sm → text-base */}
                      <div className="mt-3 text-base ml-2 font-semibold text-[#F6F6F6] truncate group-hover:text-[#AFDEE2] transition-colors">
                        {a.name}
                      </div>
                      {/* ✅ text-xs → text-sm */}
                      <div className="mt-1 text-sm ml-2 text-[#F6F6F6]/60 truncate">아티스트</div>
                    </button>
                  ))}
                </div>
              </HorizontalScroller>
            )}
          </SectionShell>

          {/* 앨범: 규격 통일 */}
          <SectionShell title="앨범" onMore={() => navigate(`/search/album${search}`)}>
            {loading && hasQuery ? (
              <HorizontalScroller gradientFromClass="from-[#2d2d2d]/80">
                <div className="flex gap-2 min-w-max px-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="w-[220px] text-left shrink-0">
                      <SkeletonBox className="w-48 h-48 rounded-2xl" />
                      <SkeletonBox className="mt-3 ml-1 h-4 w-36 rounded-md" />
                    </div>
                  ))}
                </div>
              </HorizontalScroller>
            ) : albums.length === 0 ? (
              <div className="px-2">
                <EmptyText>{hasQuery ? "해당 검색어의 앨범이 없습니다." : "검색어를 입력하면 앨범이 표시됩니다."}</EmptyText>
              </div>
            ) : (
              <HorizontalScroller gradientFromClass="from-[#2d2d2d]/80">
                <div className="flex gap-2 min-w-max px-2">
                  {albums.slice(0, 10).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => navigate(`/album/${a.id}`)}
                      className="w-[220px] text-left group shrink-0"
                    >
                      <div
                        className="
                          w-48 h-48 rounded-2xl
                          bg-white/10 overflow-hidden relative
                          transition-all duration-700 ease-out
                          group-hover:shadow-[0_16px_28px_rgba(0,0,0,0.55)]
                        "
                      >
                        {a.image ? (
                          <img
                            src={resolveImage(a.image)}
                            alt={a.name}
                            width={192}
                            height={192}
                            className="
                              w-full h-full object-cover
                              transition-all duration-1000
                              opacity-90 brightness-95
                              group-hover:scale-[1.15]
                              group-hover:opacity-100
                              group-hover:brightness-110
                            "
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-white/10" />
                        )}
                      </div>

                      {/* ✅ text-sm → text-base */}
                      <div className="mt-3 ml-1 text-base font-semibold text-[#F6F6F6] truncate group-hover:text-[#AFDEE2] transition-colors">
                        {a.name}
                      </div>
                    </button>
                  ))}
                </div>
              </HorizontalScroller>
            )}
          </SectionShell>
        </div>
      </div>
    </div>
  );
}
