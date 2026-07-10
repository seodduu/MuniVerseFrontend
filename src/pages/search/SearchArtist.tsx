import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

type Artist = { id: string; name: string; image?: string | null };

// API 응답 타입
type ApiSearchResult = {
  music_id: number;
  itunes_id: number | null;
  music_name: string;
  artist_name: string;
  artist_id: number | null;
  album_name: string;
  album_id: number | null;
  genre: string;
  duration: number | null;
  is_ai: boolean;
  audio_url: string | null;
  album_image: string | null;
  in_db: boolean;
  has_matching_tags: boolean;
};

// 연관 아티스트 타입
type RelatedArtist = {
  artist_id: number;
  artist_name: string;
  artist_image: string;
};

type ApiSearchResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ApiSearchResult[];
  related_artists: RelatedArtist[];
};

const ALL_ARTISTS: Artist[] = Array.from({ length: 12 }).map((_, i) => ({
  id: String(i + 1),
  name: `아티스트명 ${i + 1}`,
}));

export default function SearchArtist() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const q = (sp.get("q") ?? "").trim();

  const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const __DEV__ = import.meta.env.DEV;

  // API 데이터 상태
  const [apiArtists, setApiArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 검색 API 호출
  useEffect(() => {
    if (!API_BASE || !q.trim()) {
      setApiArtists([]);
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

        if (!res.ok) {
          throw new Error(`API 오류: ${res.status}`);
        }

        const data: ApiSearchResponse = await res.json();
        
        console.log(`[SearchArtist] 🔥🔥🔥 API 응답 받음:`, {
          results_count: data.results?.length || 0,
          related_artists_count: data.related_artists?.length || 0,
          has_related_artists: !!data.related_artists,
        });

        // related_artists를 직접 사용 (이미지 포함)
        if (data.related_artists && data.related_artists.length > 0) {
          const artists: Artist[] = data.related_artists.map((ra) => ({
            id: String(ra.artist_id),
            name: ra.artist_name,
            image: ra.artist_image || null,
          }));
          setApiArtists(artists);
          console.log(`[SearchArtist] ✅ ${artists.length}개 연관 아티스트 로드 완료`);
        } else {
          // related_artists가 없으면 기존 방식으로 폴백 (중복 제거)
          const artistMap = new Map<number, Artist>();
          data.results.forEach((r) => {
            if (r.artist_id && !artistMap.has(r.artist_id)) {
              artistMap.set(r.artist_id, {
                id: String(r.artist_id),
                name: r.artist_name,
                image: null,
              });
            }
          });
          const extractedArtists = Array.from(artistMap.values());
          setApiArtists(extractedArtists);
          console.log(`[SearchArtist] ⚠️ related_artists 없음, results에서 ${extractedArtists.length}개 추출`);
        }
      } catch (e: unknown) {
        if ((e as DOMException)?.name === "AbortError") return;
        console.error("[SearchArtist] 검색 API 오류:", e);
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
        setApiArtists([]);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [API_BASE, q]);

  const artists = useMemo(() => {
    let result: Artist[];

    if (API_BASE && q.trim() && apiArtists.length > 0) {
      // API에서 가져온 아티스트 (이미지 포함)
      result = apiArtists;
    } else {
      if (!q) {
        result = ALL_ARTISTS;
      } else {
        const lower = q.toLowerCase();
        result = ALL_ARTISTS.filter((a) => a.name.toLowerCase().includes(lower));
      }
    }

    return result;
  }, [API_BASE, q, apiArtists]);

  const resolveImage = (url: string) => {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("//")) return url;
    if (API_BASE && url.startsWith("/")) return `${API_BASE.replace("/api/v1", "")}${url}`;
    return url;
  };

  return (
    <section className="w-full mt-4 rounded-[40px] bg-white/[0.05] backdrop-blur-2xl border border-white/10 px-6 py-8 min-h-[560px]">
      {/* 아티스트 그리드 */}
      {loading && artists.length === 0 ? (
        <div className="text-center text-white/20 py-12 text-lg">검색 중...</div>
      ) : error && artists.length === 0 ? (
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
            {artists.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`/artists/${a.id}`)}
                className="
                  group
                  rounded-3xl
                  p-3
                  flex flex-col items-center text-center
                  transition-all duration-500
                  hover:-translate-y-2
                "
              >
                {/* 썸네일: 조금 키움 (w-52/h-52 -> w-56/h-56) */}
                <div
                  className="
                    w-56 h-56
                    rounded-full
                    bg-white/10
                    overflow-hidden
                    relative
                    transition-all duration-700 ease-out
                    group-hover:shadow-[0_16px_28px_rgba(0,0,0,0.55)]
                  "
                >
                  {a.image ? (
                    <img
                      src={resolveImage(a.image)}
                      alt={a.name}
                      className="
                        w-full h-full object-cover
                        transition-transform duration-1000
                        opacity-90 brightness-95
                        group-hover:scale-110
                        group-hover:opacity-100
                        group-hover:brightness-110
                      "
                      onError={(e) => {
                        if (__DEV__)
                          console.error("[SearchArtist] ❌ 이미지 로드 실패", {
                            name: a.name,
                            id: a.id,
                            image_url: a.image,
                          });
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                      onLoad={(e) => {
                        const img = e.target as HTMLImageElement;
                        const fallback = img.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = "none";
                      }}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/10" />
                  )}
                </div>
  
                {/* 텍스트: 한 단계씩 업 */}
                <div
                  className="
                    mt-6
                    break-words leading-snug
                    text-lg
                    font-semibold
                    text-[#f6f6f6]
                    truncate w-full
                    group-hover:text-[#AFDEE2]
                    transition-colors tracking-tight
                    px-2
                  "
                >
                  {a.name}
                </div>
                <div className="mt-1 text-sm font-medium text-[#f6f6f6]/30">아티스트</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
  
}
