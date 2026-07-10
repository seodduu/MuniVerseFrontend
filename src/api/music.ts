// src/api/music.ts
import axiosInstance from "./axiosInstance";

/**
 * 음악 재생 로그 기록
 * POST /tracks/{musicId}/play
 */
export async function logPlayTrack(musicId: number): Promise<void> {
  try {
    console.log('📡 API 호출 시작:', `POST /tracks/${musicId}/play`);
    const response = await axiosInstance.post(`/tracks/${musicId}/play`);
    console.log('✅ API 호출 성공:', response.status, response.data);
  } catch (error) {
    console.error("[API] Failed to log play track:", error);
    console.error("상세 에러:", {
      musicId,
      error: error instanceof Error ? error.message : error,
    });
    // 로그 기록 실패는 재생을 방해하지 않도록 에러를 삼킴
  }
}

/**
 * 음악 오디오 URL 가져오기
 * GET /tracks/{musicId}/play
 */
export async function fetchAudioUrl(musicId: number): Promise<string> {
  const res = await axiosInstance.get<{ audio_url: string }>(
    `/tracks/${musicId}/play`
  );
  return res.data.audio_url;
}

/**
 * 모든 사용자의 AI 음악 목록 조회
 * GET /api/v1/?is_ai=true
 * 
 * @param options - 필터링 옵션
 * @returns AI 음악 목록
 */
export interface ListMusicOptions {
  is_ai?: boolean; // true면 AI 음악만, false면 일반 음악만, undefined면 전체
  user_id?: number; // 특정 사용자 ID로 필터링 (없으면 모든 사용자)
}

export interface MusicListItem {
  music_id: number;
  music_name: string;
  audio_url: string | null;
  is_ai: boolean;
  genre: string | null;
  duration: number | null;
  lyrics: string | null;
  valence: number | null;
  arousal: number | null;
  artist_name: string | null;
  album_name: string | null;
  album_id: number | null;
  album_image: string | null;
  album_image_square: string | null;
  created_at: string;
}

export async function listAllAiMusic(options?: ListMusicOptions): Promise<MusicListItem[]> {
  const params: Record<string, string> = {};

  if (options?.is_ai !== undefined) {
    params.is_ai = options.is_ai ? 'true' : 'false';
  }

  if (options?.user_id !== undefined) {
    params.user_id = options.user_id.toString();
  }

  console.log("[API] listAllAiMusic 호출", { params });

  const res = await axiosInstance.get<MusicListItem[]>('/', { params });

  console.log("[API] listAllAiMusic 응답", {
    count: res.data?.length ?? 0,
    data: res.data
  });

  return Array.isArray(res.data) ? res.data : [];
}

/**
 * 음악 상세 정보 조회 (앨범 이미지 포함)
 * GET /api/v1/{music_id}/
 */
export interface MusicDetailResponse {
  music_id: number;
  music_name: string;
  audio_url: string | null;
  is_ai: boolean;
  genre: string | null;
  duration: number | null;
  lyrics: string | null;
  artist_name: string | null;
  album_name: string | null;
  album_id?: number | null; // 앨범 ID (있을 수 있음)
  // 앨범 이미지 필드들 (직접 응답에 포함될 수 있음)
  image_square?: string | null;
  image_large_square?: string | null;
  album_image?: string | null;
  ai_info?: Array<{
    aiinfo_id?: number;
    input_prompt?: string;
    created_at?: string;
  }>;
  created_at: string;
}

export async function getMusicDetail(musicId: number): Promise<MusicDetailResponse | null> {
  try {
    console.log("[API] getMusicDetail 호출", { musicId });
    const res = await axiosInstance.get<MusicDetailResponse>(`/${musicId}/`);
    console.log("[API] getMusicDetail 응답", { musicId, data: res.data });
    return res.data;
  } catch (error) {
    console.error("[API] getMusicDetail 실패", { musicId, error });
    return null;
  }
}

/**
 * 앨범 상세 정보 조회 (앨범 이미지 포함)
 * GET /api/v1/albums/{album_id}/
 */
export interface AlbumDetailResponse {
  album_id: number;
  album_name: string;
  album_image: string | null;
  image_large_square: string | null;
  artist: {
    artist_id: number;
    artist_name: string;
  };
}

export async function getAlbumDetail(albumId: number): Promise<AlbumDetailResponse | null> {
  try {
    console.log("[API] getAlbumDetail 호출", { albumId });
    const res = await axiosInstance.get<AlbumDetailResponse>(`/albums/${albumId}/`);
    console.log("[API] getAlbumDetail 응답", { albumId, data: res.data });
    return res.data;
  } catch (error) {
    console.error("[API] getAlbumDetail 실패", { albumId, error });
    return null;
  }
}

/**
 * music_id로 앨범 이미지 가져오기
 * 음악 상세 -> 앨범 상세 순서로 조회
 */
export async function getAlbumImageByMusicId(musicId: number): Promise<string | null> {
  try {
    // 1. 음악 상세 조회
    const musicDetail = await getMusicDetail(musicId);
    if (!musicDetail || !musicDetail.album_name) {
      return null;
    }

    // 2. 앨범 ID를 찾기 위해 앨범 이름으로 검색하거나, 다른 방법 사용
    // 일단 음악 상세에서 album_id를 직접 가져올 수 있는지 확인 필요
    // 없으면 앨범 이름으로 검색해야 할 수도 있음

    // 임시로 음악 상세 API 응답에 album_id가 포함되어 있는지 확인
    // 없으면 앨범 이름으로 검색하는 로직 추가 필요

    return null;
  } catch (error) {
    console.error("[API] getAlbumImageByMusicId 실패", { musicId, error });
    return null;
  }
}

/**
 * 태그 그래프 데이터 조회 (Treemap용)
 * GET /api/v1/tracks/{music_id}/tag-graph
 */
export interface TagGraphItem {
  name: string;
  size: number;
  color?: string;
  children?: TagGraphItem[];
  [key: string]: unknown;
}

// Treemap용 percentage 기반 글래스모피즘 색상 생성
// 전체 UI와 조화로운 반투명 톤
function getColorByPercentage(percentage: number, minPct: number, maxPct: number): string {
  // 0~1 범위로 정규화
  const normalized = maxPct === minPct ? 0.5 : (percentage - minPct) / (maxPct - minPct);

  // 글래스모피즘: 낮은 채도, 높은 명도, rgba 사용
  let hue: number;

  if (normalized < 0.2) {
    hue = 180; // 청록
  } else if (normalized < 0.4) {
    hue = 200; // 스카이블루
  } else if (normalized < 0.6) {
    hue = 220; // 블루
  } else if (normalized < 0.8) {
    hue = 260; // 보라
  } else {
    hue = 300; // 핑크
  }

  // 반투명 글래스 느낌: rgba 사용
  return `hsla(${hue}, 20%, 75%, 0.35)`;
}

export async function getTagGraph(musicId: number): Promise<TagGraphItem[]> {
  try {
    console.log("[API] getTagGraph 호출", { musicId });
    const res = await axiosInstance.get<any>(`/tracks/${musicId}/tag-graph`);
    console.log("[API] getTagGraph 응답 원본:", res.data);

    // API 응답 형식에 따라 데이터 추출
    // 응답 형태: [{name: "Tags", children: [{name, size, percentage}, ...]}]
    let rawData: any[] = [];
    const data = res.data;

    // 1. 배열인 경우 (바로 리스트)
    if (Array.isArray(data)) {
      if (data.length > 0 && data[0].children) {
        // [{name: "Tags", children: [...]}] 형태 (기존 Treemap 구조)
        rawData = data[0].children;
      } else {
        // 일반 배열 형태
        rawData = data;
      }
    }
    // 2. 객체인 경우 (속성 탐색)
    else if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data.children)) {
        rawData = data.children;
      } else if (Array.isArray(data.tags)) {
        rawData = data.tags;
      } else if (Array.isArray(data.data)) {
        rawData = data.data;
      } else if (Array.isArray(data.items)) {
        rawData = data.items;
      } else if (Array.isArray(data.results)) {
        rawData = data.results;
      } else if (Array.isArray(data.tag_graph)) {
        rawData = data.tag_graph;
      } else if (Array.isArray(data.keywords)) {
        rawData = data.keywords;
      }
    }

    console.log("[API] getTagGraph 파싱된 데이터:", rawData);

    if (!rawData || rawData.length === 0) {
      console.warn("[API] Unexpected tag-graph response format or empty data:", data);
      return [];
    }

    // API 응답을 TagGraphItem 형식으로 변환
    // percentage를 size로 사용 (Treemap/WordCloud 크기 결정)
    // 다양한 필드명을 지원 (value, count, score, weight 등)
    const percentages = rawData.map((item: any) => {
      const val = item.percentage ?? item.size ?? item.value ?? item.count ?? item.score ?? item.weight ?? 10;
      return Number(val);
    });

    // 유효한 숫자만 필터링
    const validPercentages = percentages.filter((p: number) => !Number.isNaN(p));
    const minPct = validPercentages.length > 0 ? Math.min(...validPercentages) : 0;
    const maxPct = validPercentages.length > 0 ? Math.max(...validPercentages) : 100;

    return rawData.map((item: any, index: number) => {
      // 값을 숫자로 확실하게 변환
      let pct = Number(item.percentage ?? item.size ?? item.value ?? item.count ?? item.score ?? item.weight ?? 10);
      if (Number.isNaN(pct)) pct = 10;

      // 이름 필드 탐색
      const name = item.name || item.tag_key || item.tag || item.label || item.keyword || item.text || `Tag ${index + 1}`;

      return {
        name: String(name),
        size: pct,
        color: getColorByPercentage(pct, minPct, maxPct),
      };
    });
  } catch (error) {
    console.error("[API] getTagGraph 실패", { musicId, error });
    return [];
  }
}

/**
 * Tag Search API
 * GET /api/v1/search/tags?page=1&page_size=100&tag=summer,sad
 */
export interface TagSearchResult {
  music_id: number;
  music_name: string;
  artist_name: string | null;
  album_name: string | null;
  audio_url: string | null;
  image_square?: string | null;
  image_large_square?: string | null;
  album_image?: string | null;
  score?: number;
}

export interface TagSearchResponse {
  items: TagSearchResult[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * Canvas GraphRAG Search API
 * GET /api/v1/canvas/graphrag?tags=summer,sad&limit=120
 */
export interface CanvasGraphRagResolvedTag {
  tag_id: number;
  tag_key: string;
  tag_name: string;
}

export interface CanvasGraphRagMatchedTag {
  tag_key: string;
  tag_name: string;
  score: number;
}

export interface CanvasGraphRagExplanation {
  type: string;
  path: string[];
  weight: number;
  reason: string;
}

export interface CanvasGraphRagItem {
  music_id: number;
  music_name: string;
  artist_name: string | null;
  album_name: string | null;
  audio_url: string | null;
  image_square?: string | null;
  image_large_square?: string | null;
  album_image?: string | null;
  relevance_score: number;
  visual_weight: number;
  cluster?: string | null;
  matched_tags?: CanvasGraphRagMatchedTag[];
  explanations?: CanvasGraphRagExplanation[];
}

export interface CanvasGraphRagResponse {
  status: "ok" | "empty_data" | "no_query_match" | "no_results" | string;
  query: {
    tags: string[];
    resolved_tags: CanvasGraphRagResolvedTag[];
    unresolved_tags: string[];
  };
  items: CanvasGraphRagItem[];
  meta: {
    returned: number;
    data_state: string;
    message?: string;
    total_candidates?: number;
    graph_version?: string;
  };
}

export async function searchCanvasGraphRag(tags: string, limit: number = 120): Promise<CanvasGraphRagResponse> {
  try {
    console.log("[API] searchCanvasGraphRag 호출", { tags, limit });
    const res = await axiosInstance.get<CanvasGraphRagResponse>('/canvas/graphrag', {
      params: {
        tags,
        limit
      }
    });
    console.log("[API] searchCanvasGraphRag 응답", res.data);
    return res.data;
  } catch (error) {
    console.error("[API] searchCanvasGraphRag 실패", { tags, error });
    return {
      status: "error",
      query: {
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        resolved_tags: [],
        unresolved_tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      },
      items: [],
      meta: {
        returned: 0,
        data_state: "api_error",
        message: "GraphRAG 검색 중 오류가 발생했습니다."
      }
    };
  }
}

/**
 * LISA의 MONEY 곡 정보를 가져오는 헬퍼 함수
 */
async function getLisaMoneyTrack(): Promise<TagSearchResult | null> {
  try {
    // 1. LISA의 MONEY를 검색하여 찾기 시도
    try {
      const searchRes = await axiosInstance.get('/search', {
        params: {
          q: 'LISA MONEY',
          page_size: 10
        }
      });

      const searchResults = searchRes.data?.results || searchRes.data || [];
      const lisaMoney = Array.isArray(searchResults)
        ? searchResults.find((r: any) =>
          r.music_name?.toLowerCase().includes('money') &&
          r.artist_name?.toLowerCase().includes('lisa')
        )
        : null;

      if (lisaMoney) {
        return {
          music_id: lisaMoney.music_id,
          music_name: lisaMoney.music_name || 'MONEY',
          artist_name: lisaMoney.artist_name || 'LISA',
          album_name: lisaMoney.album_name,
          audio_url: lisaMoney.audio_url,
          image_square: lisaMoney.album_image || lisaMoney.image_square,
          image_large_square: lisaMoney.album_image || lisaMoney.image_large_square,
          album_image: lisaMoney.album_image,
          score: 1.0 // 높은 점수로 설정하여 상위에 표시
        };
      }
    } catch (searchError) {
      console.warn("[API] LISA MONEY API search failed, using fallback", searchError);
    }

    // 2. 검색 실패 시 하드코딩된 ID로 조회 시도
    try {
      const targetId = 7484; // User provided ID
      const detail = await getMusicDetail(targetId);
      if (detail) {
        return {
          music_id: detail.music_id,
          music_name: detail.music_name,
          artist_name: detail.artist_name,
          album_name: detail.album_name,
          audio_url: detail.audio_url,
          image_square: detail.image_square || detail.album_image,
          image_large_square: detail.image_large_square || detail.album_image,
          album_image: detail.album_image,
          score: 1.0
        };
      }
    } catch (ignore) {
      // ID 조회 실패 시 완전히 하드코딩된 값 사용
    }

    // 3. 최후의 수단: 완전 하드코딩 (User provided IDs)
    return {
      music_id: 7484,
      music_name: 'MONEY',
      artist_name: 'LISA',
      album_name: 'LALISA',
      // album_id: 5983, // TagSearchResult에는 album_id 필드가 없으므로 생략하거나 필요시 추가
      audio_url: null,
      image_square: 'https://i.scdn.co/image/ab67616d0000b273a1158a176cb6db0d8544ba8c',
      image_large_square: 'https://i.scdn.co/image/ab67616d0000b273a1158a176cb6db0d8544ba8c',
      album_image: 'https://i.scdn.co/image/ab67616d0000b273a1158a176cb6db0d8544ba8c',
      score: 1.0
    };

  } catch (error) {
    console.error("[API] getLisaMoneyTrack 실패", error);
    // 최악의 경우에도 폴백 반환
    return {
      music_id: 7484,
      music_name: 'MONEY',
      artist_name: 'LISA',
      album_name: 'LALISA',
      audio_url: null,
      image_square: 'https://i.scdn.co/image/ab67616d0000b273a1158a176cb6db0d8544ba8c',
      image_large_square: 'https://i.scdn.co/image/ab67616d0000b273a1158a176cb6db0d8544ba8c',
      album_image: 'https://i.scdn.co/image/ab67616d0000b273a1158a176cb6db0d8544ba8c',
      score: 1.0
    };
  }
}

export async function searchByTags(tags: string, pageSize: number = 100): Promise<TagSearchResult[]> {
  try {
    console.log("[API] searchByTags 호출", { tags, pageSize });

    const res = await axiosInstance.get('/search/tags', {
      params: {
        page: 1,
        page_size: pageSize,
        tag: tags
      }
    });

    console.log("[API] searchByTags 전체 응답", res.data);

    // Handle different response formats
    let results: TagSearchResult[] = [];
    if (Array.isArray(res.data)) {
      // Direct array response
      results = res.data;
    } else if (res.data?.items && Array.isArray(res.data.items)) {
      // Paginated response with items
      results = res.data.items;
    } else if (res.data?.results && Array.isArray(res.data.results)) {
      // Django REST style response
      results = res.data.results;
    } else {
      console.warn("[API] searchByTags 알 수 없는 응답 형식", res.data);
      return [];
    }

    // "happy" 태그 검색 시 LISA의 MONEY를 반드시 포함
    const normalizedTags = tags.toLowerCase().split(',').map(t => t.trim());
    if (normalizedTags.includes('happy')) {
      const lisaMoney = await getLisaMoneyTrack();
      if (lisaMoney) {
        // 이미 결과에 포함되어 있는지 확인
        const alreadyIncluded = results.some(r => r.music_id === lisaMoney.music_id);
        if (!alreadyIncluded) {
          // 맨 앞에 추가하여 우선 표시
          results = [lisaMoney, ...results];
        } else {
          // 이미 포함되어 있으면 맨 앞으로 이동
          const index = results.findIndex(r => r.music_id === lisaMoney.music_id);
          if (index > 0) {
            const [lisaMoneyItem] = results.splice(index, 1);
            results = [lisaMoneyItem, ...results];
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error("[API] searchByTags 실패", { tags, error });
    return [];
  }
}

/**
 * Canvas Album Item Interface
 */
export interface CanvasAlbum {
  id: number;
  title: string;
  artist: string;
  cover: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  relevanceScore?: number;
  visualWeight?: number;
  cluster?: string | null;
  matchedTags?: CanvasGraphRagMatchedTag[];
  explanations?: CanvasGraphRagExplanation[];
}

/**
 * Fetch real albums/tracks and map them to the canvas format 
 * with random positions.
 * 
 * OPTIMIZED: Uses caching and fewer API calls
 */

// Cache for fetched albums to avoid repeated API calls
let albumCache: CanvasAlbum[] = [];
let cacheLoadPromise: Promise<void> | null = null;

async function preloadAlbumCache() {
  if (cacheLoadPromise) return cacheLoadPromise;

  cacheLoadPromise = (async () => {
    // Pre-fetch a larger batch of random albums once
    const batchSize = 30; // Fetch 30 in one go
    const promises: Promise<MusicDetailResponse | null>[] = [];

    for (let i = 0; i < batchSize; i++) {
      const randomId = Math.floor(Math.random() * 30000) + 1;
      promises.push(getMusicDetail(randomId));
    }

    const results = await Promise.all(promises);

    for (const item of results) {
      if (item) {
        const coverImage = item.image_large_square || item.image_square || item.album_image;
        if (coverImage) {
          albumCache.push({
            id: item.music_id,
            title: item.music_name || "Unknown Track",
            artist: item.artist_name || "Unknown Artist",
            cover: coverImage,
            x: 0,
            y: 0,
            rotation: 0,
            scale: 1
          });
        }
      }
    }
  })();

  return cacheLoadPromise;
}

export async function getCanvasAlbums(count: number = 3): Promise<CanvasAlbum[]> {
  // 1. Check cache first
  if (albumCache.length >= count) {
    // Take from cache
    const result = albumCache.splice(0, count);

    // Refill cache in background (don't wait)
    if (albumCache.length < 10) {
      cacheLoadPromise = null;
      preloadAlbumCache();
    }

    return result;
  }

  // 2. If cache empty, fetch directly (smaller batch for speed)
  const promises: Promise<MusicDetailResponse | null>[] = [];

  // Only fetch what we need + small buffer
  for (let i = 0; i < count + 2; i++) {
    const randomId = Math.floor(Math.random() * 30000) + 1;
    promises.push(getMusicDetail(randomId));
  }

  const results = await Promise.all(promises);
  const validItems: CanvasAlbum[] = [];

  for (const item of results) {
    if (validItems.length >= count) break;

    if (item) {
      const coverImage = item.image_large_square || item.image_square || item.album_image;
      if (coverImage) {
        validItems.push({
          id: item.music_id,
          title: item.music_name || "Unknown Track",
          artist: item.artist_name || "Unknown Artist",
          cover: coverImage,
          x: 0,
          y: 0,
          rotation: 0,
          scale: 1
        });
      }
    }
  }

  // Start preloading for next calls
  preloadAlbumCache();

  return validItems;
}

export async function playTrack(musicId: number): Promise<string | null> {
  try {
    const res = await axiosInstance.get(`/tracks/${musicId}/play`);
    console.log("[API] Play Track", res.data);
    return res.data.audio_url || null;
  } catch (error) {
    console.error("[API] Failed to play track", error);
    return null;
  }
}
