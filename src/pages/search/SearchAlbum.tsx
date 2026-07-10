import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

type Album = { id: string; title: string; artist: string; year?: string; image?: string | null };

// API 응답 타입
type ApiSearchResult = {
  itunes_id: number;
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

// 아티스트별 앨범 API 응답 타입
type ArtistAlbum = {
  id: string;
  title: string;
  year: string;
  album_image: string | null;
  image_large_square?: string | null; // 있을 수도
};

const ALL_ALBUMS: Album[] = Array.from({ length: 12 }).map((_, i) => ({
  id: String(i + 1),
  title: `앨범명 ${i + 1}`,
  artist: `아티스트명 ${((i % 6) + 1)}`,
}));

export default function SearchAlbum() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const q = (sp.get("q") ?? "").trim();

  const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const __DEV__ = import.meta.env.DEV;

  // API 데이터 상태
  const [apiAlbums, setApiAlbums] = useState<ArtistAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveImage = (url: string) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("//")) return url;
    if (API_BASE && url.startsWith("/")) return `${API_BASE.replace("/api/v1", "")}${url}`;
    return url;
  };

  // 아티스트별 앨범 정보 가져오기
  const fetchArtistAlbums = useCallback(
    async (artistIds: number[]) => {
      if (!API_BASE) return;

      const allAlbums: ArtistAlbum[] = [];
      const seenAlbumIds = new Set<string>();

      try {
        const promises = artistIds.map(async (artistId) => {
          try {
            const url = `${API_BASE}/artists/${artistId}/albums/`;
            const res = await fetch(url, {
              method: "GET",
              headers: { "Content-Type": "application/json" },
            });

            if (!res.ok) return null;
            const data: ArtistAlbum[] = await res.json();
            return { artistId, albums: data };
          } catch (e) {
            if (__DEV__) console.error(`[SearchAlbum] 아티스트 ${artistId}의 앨범 목록 가져오기 실패:`, e);
            return null;
          }
        });

        const results = await Promise.all(promises);

        // 중복 제거
        results.forEach((result) => {
          if (!result) return;
          result.albums.forEach((album) => {
            if (!seenAlbumIds.has(album.id)) {
              seenAlbumIds.add(album.id);
              allAlbums.push(album);
            }
          });
        });

        setApiAlbums(allAlbums);
      } catch (e) {
        if (__DEV__) console.error("[SearchAlbum] 아티스트별 앨범 정보 가져오기 오류:", e);
      }
    },
    [API_BASE, __DEV__]
  );

  // 검색 API 호출
  useEffect(() => {
    if (!API_BASE || !q.trim()) {
      setApiAlbums([]);
      setError(null);
      return;
    }

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          q: q,
          page_size: "100",
        });

        const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) throw new Error(`API 오류: ${res.status}`);

        const data: ApiSearchResponse = await res.json();

        // 고유한 artist_id 추출 (null 제외)
        const uniqueArtistIds = Array.from(
          new Set(data.results.map((r) => r.artist_id).filter((id): id is number => id !== null))
        ).slice(0, 12);

        if (uniqueArtistIds.length > 0) {
          await fetchArtistAlbums(uniqueArtistIds);
        } else {
          setApiAlbums([]);
        }
      } catch (e: unknown) {
        if ((e as DOMException)?.name === "AbortError") return;
        if (__DEV__) console.error("[SearchAlbum] 검색 API 오류:", e);
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
        setApiAlbums([]);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [API_BASE, q, fetchArtistAlbums, __DEV__]);

  const albums = useMemo<Album[]>(() => {
    if (API_BASE && q.trim() && apiAlbums.length > 0) {
      return apiAlbums.map((a) => ({
        id: a.id,
        title: a.title,
        artist: "", // 필요하면 추가로 매핑
        year: a.year,
        image: a.image_large_square ?? a.album_image ?? null,
      }));
    }
    if (!q) return ALL_ALBUMS;
    const lower = q.toLowerCase();
    return ALL_ALBUMS.filter((a) => a.title.toLowerCase().includes(lower) || a.artist.toLowerCase().includes(lower));
  }, [API_BASE, q, apiAlbums]);

  return (
    <section className="w-full mt-4 rounded-[40px] bg-white/[0.05] backdrop-blur-2xl border border-white/10 px-6 py-8 min-h-[560px]">
      {loading && albums.length === 0 ? (
        <div className="text-center text-white/20 py-12 text-lg">검색 중...</div>
      ) : error && albums.length === 0 ? (
        <div className="text-center text-red-400 py-12 text-lg">오류가 발생했습니다: {error}</div>
      ) : (
        <div className="overflow-x-auto no-scrollbar">
          <div
            className="
              grid
              gap-x-10
              gap-y-14
              justify-between
              [grid-template-columns:repeat(5,220px)]
              px-4
            "
          >
            {albums.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/album/${a.id}`)}
                className="w-[220px] text-left group shrink-0"
              >
                {/* 커버: 조금 키움 (w-50/h-50 -> w-52/h-52) */}
                <div
                  className="
                    w-52 h-52 rounded-2xl
                    bg-white/10 overflow-hidden relative
                    transition-all duration-700 ease-out
                    group-hover:shadow-[0_16px_28px_rgba(0,0,0,0.55)]
                  "
                >
                  {a.image ? (
                    <img
                      src={resolveImage(a.image)}
                      alt={a.title}
                      className="
                        w-full h-full object-cover
                        transition-all duration-1000
                        opacity-90 brightness-95
                        group-hover:scale-[1.15]
                        group-hover:opacity-100
                        group-hover:brightness-110
                      "
                      onError={(e) => {
                        if (__DEV__)
                          console.error("[SearchAlbum] ❌ 앨범 이미지 로드 실패:", {
                            title: a.title,
                            id: a.id,
                            image_url: a.image,
                          });
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/10" />
                  )}
                </div>
  
                {/* 텍스트: 한 단계 업 */}
                <div className="mt-4 ml-1 text-lg font-semibold text-[#F6F6F6] truncate group-hover:text-[#AFDEE2] transition-colors">
                  {a.title}
                </div>
  
                {a.artist ? (
                  <div className="mt-1 ml-1 text-sm text-[#F6F6F6]/60 truncate">{a.artist}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
  
}
