import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from 'react-router-dom';
import InfiniteCanvas from "../../components/canvas/InfiniteCanvas";
import AlbumDetailOverlay from "../../components/canvas/AlbumDetailOverlay";
import MusicPlayerBar from "../../components/canvas/MusicPlayerBar";
import { searchCanvasGraphRag, askCanvas, getCanvasAnswer, getCanvasAlbums, playTrack, type CanvasAlbum, type CanvasGraphRagItem } from "../../api/music";

const CHUNK_SIZE = 1200; // Larger chunks for more spread
const MAX_CHUNK_DIST = 2;
const ITEMS_PER_CHUNK = 3; // Keep sparse (3 * 49 chunks ≈ 147 slots)

// Helper for collision-free layout within a chunk
function generateNonOverlappingPositions(chunkX: number, chunkY: number, scales: number[]) {
    const positions: { x: number, y: number, rotation: number, scale: number }[] = [];
    const minDistance = 450; // Much larger minimum distance
    const padding = 150;
    const attemptsLimit = 50;

    for (let i = 0; i < scales.length; i++) {
        const itemScale = scales[i];
        let bestX = 0, bestY = 0;
        let valid = false;

        for (let attempt = 0; attempt < attemptsLimit; attempt++) {
            const centerX = chunkX * CHUNK_SIZE;
            const centerY = chunkY * CHUNK_SIZE;

            const offsetX = (Math.random() - 0.5) * (CHUNK_SIZE - padding * 2);
            const offsetY = (Math.random() - 0.5) * (CHUNK_SIZE - padding * 2);

            const x = centerX + offsetX;
            const y = centerY + offsetY;

            // Simple collision check (approximation using minDistance + scale factor could be better, but fixed minDistance works for now)
            let collision = false;
            for (const pos of positions) {
                const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                // Add scale factor to minDistance to prevent overlap of large items
                const dynamicMinDist = minDistance * ((itemScale + pos.scale) / 2);
                if (dist < dynamicMinDist) {
                    collision = true;
                    break;
                }
            }

            if (!collision) {
                bestX = x;
                bestY = y;
                valid = true;
                break;
            }
        }

        if (valid) {
            positions.push({
                x: bestX,
                y: bestY,
                rotation: (Math.random() - 0.5) * 30,
                scale: itemScale
            });
        }
    }
    return positions;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

// Convert CanvasGraphRagItem to CanvasAlbum format
function mapToCanvasAlbum(item: CanvasGraphRagItem): CanvasAlbum | null {
    const cover = item.image_large_square || item.image_square || item.album_image;
    if (!cover) return null;

    const visualWeight = clamp(item.visual_weight ?? item.relevance_score ?? 0.5, 0, 1);
    const scale = 0.55 + (visualWeight * 1.15); // Scale range 0.55 to 1.7

    return {
        id: item.music_id,
        title: item.music_name || "Unknown Track",
        artist: item.artist_name || "Unknown Artist",
        cover,
        x: 0,
        y: 0,
        rotation: 0,
        scale,
        relevanceScore: item.relevance_score,
        visualWeight: item.visual_weight,
        cluster: item.cluster,
        matchedTags: item.matched_tags,
        explanations: item.explanations,
    };
}

// music_db_legal에 실제 시드된 Last.fm 무드 태그 (곡 연결 수 많은 순)
const RECOMMENDED_TAGS = [
    "sad", "chill", "happy", "mellow", "beautiful", "dark", "dreamy", "melancholic", "summer", "chillout",
    "atmospheric", "emotional", "energetic", "romantic", "sexy", "upbeat", "easy listening", "melancholy", "relaxing"
];

export default function InteractiveCanvasPage() {
    const navigate = useNavigate();
    const [albums, setAlbums] = useState<CanvasAlbum[]>([]);
    const [selectedAlbum, setSelectedAlbum] = useState<CanvasAlbum | null>(null);
    const [playingMusic, setPlayingMusic] = useState<{ album: CanvasAlbum, url: string } | null>(null);
    const [showOverlay, setShowOverlay] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null); // 에러 메시지 상태 추가

    // 자연어 질의(/canvas/ask) 관련 상태
    const [extractedTags, setExtractedTags] = useState<string[]>([]);
    const [interpretationSource, setInterpretationSource] = useState<"llm" | "fallback_direct" | null>(null);
    const [isInterpreting, setIsInterpreting] = useState(false); // "질문을 해석하는 중…" 스피너
    const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false); // 태그 해석 완료 후 "답변을 생성하는 중…" 단계 안내
    const [answer, setAnswer] = useState<string | null>(null);
    const [showNoMatchHint, setShowNoMatchHint] = useState(false); // extracted_tags가 빈 배열일 때

    // Cache for search results
    const searchCacheRef = useRef<CanvasAlbum[]>([]);
    const loadedChunksRef = useRef<Set<string>>(new Set());
    const currentTagsRef = useRef<string>("");
    const initialLoadDoneRef = useRef(false);

    // 요청 시퀀스 가드: 새 검색/답변 사이클마다 증가시키고, 비동기 완료 시점에
    // 시퀀스가 여전히 최신인지 확인해서 늦게 도착한 이전 요청이 최신 상태를 덮어쓰지 않도록 한다.
    // (언마운트 이후에도 시퀀스가 갱신되지 않으므로 언마운트 후 setState도 함께 방지된다)
    const requestSeqRef = useRef(0);

    // Initial load: random albums for background behind overlay
    useEffect(() => {
        if (initialLoadDoneRef.current) return;
        initialLoadDoneRef.current = true;

        const loadInitialBackground = async () => {
            try {
                // Load random albums for background effect
                const bgAlbums = await getCanvasAlbums(20);

                // Place them spread across the viewport area
                const cols = 5;
                const rows = 4;
                const spreadX = 1800; // Total width spread
                const spreadY = 1200; // Total height spread

                const positioned = bgAlbums.map((album, index) => {
                    // Grid position with random offset
                    const col = index % cols;
                    const row = Math.floor(index / cols);

                    const baseX = (col - cols / 2) * (spreadX / cols);
                    const baseY = (row - rows / 2) * (spreadY / rows);

                    // Add random offset within cell
                    const offsetX = (Math.random() - 0.5) * 300;
                    const offsetY = (Math.random() - 0.5) * 250;

                    return {
                        ...album,
                        x: baseX + offsetX,
                        y: baseY + offsetY,
                        rotation: (Math.random() - 0.5) * 30,
                        scale: 0.7 + Math.random() * 0.6
                    };
                });

                setAlbums(positioned);
            } catch (e) {
                console.error("Failed to load initial background", e);
            }
        };

        loadInitialBackground();
    }, []);

    // Load chunk from cached search results
    const loadChunkFromCache = useCallback((chunkX: number, chunkY: number) => {
        if (Math.abs(chunkX) > MAX_CHUNK_DIST || Math.abs(chunkY) > MAX_CHUNK_DIST) return;
        if (searchCacheRef.current.length === 0) return; // No items in cache

        const chunkKey = `${chunkX},${chunkY}`;
        if (loadedChunksRef.current.has(chunkKey)) return;

        loadedChunksRef.current.add(chunkKey);

        // Take items from cache
        const itemsToPlace = searchCacheRef.current.splice(0, ITEMS_PER_CHUNK);
        if (itemsToPlace.length === 0) return;

        // Create explicit scales array from items
        const itemScales = itemsToPlace.map(item => item.scale);
        const layout = generateNonOverlappingPositions(chunkX, chunkY, itemScales);

        const placedAlbums = itemsToPlace.map((album, index) => {
            const pos = layout[index] || { x: chunkX * CHUNK_SIZE, y: chunkY * CHUNK_SIZE, rotation: 0, scale: 1 };
            return {
                ...album,
                x: pos.x,
                y: pos.y,
                rotation: pos.rotation,
                scale: pos.scale
            };
        });

        setAlbums(prev => [...prev, ...placedAlbums]);
    }, []);

    // Handle view change (drag)
    const handleViewChange = useCallback((x: number, y: number) => {
        const centerX = -x;
        const centerY = -y;

        const chunkX = Math.round(centerX / CHUNK_SIZE);
        const chunkY = Math.round(centerY / CHUNK_SIZE);

        // Load current chunk + neighbors
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                loadChunkFromCache(chunkX + dx, chunkY + dy);
            }
        }
    }, [loadChunkFromCache]);

    // items(CanvasGraphRagItem[])를 캔버스에 렌더링하는 공통 로직.
    // /graphrag 경로와 /ask 경로(태그 추출 성공 시) 모두에서 재사용한다.
    const populateCanvasFromItems = useCallback((items: CanvasGraphRagItem[]) => {
        const canvasAlbums = items
            .map(mapToCanvasAlbum)
            .filter((a): a is CanvasAlbum => a !== null);

        const shuffled = canvasAlbums.sort(() => Math.random() - 0.5);

        // Store in cache
        searchCacheRef.current = shuffled;

        // Reset state
        setAlbums([]);
        loadedChunksRef.current.clear();

        // Load initial chunks
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                loadChunkFromCache(dx, dy);
            }
        }

        setShowOverlay(false);
    }, [loadChunkFromCache]);

    // 기존 /canvas/graphrag 태그 검색 경로. 최초 검색과 태그 칩 편집(재검색) 모두에서 사용한다.
    const runGraphRagSearch = useCallback(async (tagsCsv: string) => {
        currentTagsRef.current = tagsCsv;

        const response = await searchCanvasGraphRag(tagsCsv, 120);
        const results = response.items || [];

        if (response.status !== "ok" || results.length === 0) {
            setSearchError(response.meta?.message || "검색 결과가 없습니다. 다른 태그로 시도해보세요.");
            return;
        }

        populateCanvasFromItems(results);
    }, [populateCanvasFromItems]);

    // 쉼표로 구분된 짧은 태그 리스트인지 판별하는 라우팅 휴리스틱.
    // 규칙: 쉼표 기준으로 split한 뒤 trim/빈 문자열 제거한 토큰이 1개 이상 존재하고,
    //       모든 토큰에 공백이 없으면 "태그 리스트"로 간주해 기존 /graphrag 경로로 보낸다.
    //       하나라도 공백을 포함한 토큰이 있으면(자연어 문장 등) /ask 경로로 보낸다.
    // 이 규칙은 RECOMMENDED_TAGS 버튼 클릭(단일 태그, 쉼표 없음, 공백 없음)도 기존과
    // 동일하게 /graphrag로 유지시켜준다.
    function isTagListQuery(q: string): boolean {
        const tokens = q.split(',').map(t => t.trim()).filter(Boolean);
        if (tokens.length === 0) return false;
        return tokens.every(t => !/\s/.test(t) && t.length <= 20);
    }

    // Handle search submission
    const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
        if (e) e.preventDefault();

        const q = overrideQuery || searchQuery;
        if (!q.trim()) return;

        if (overrideQuery) setSearchQuery(overrideQuery);

        if (isTagListQuery(q)) {
            // 기존 태그 리스트 경로 (변경 없음)
            const seq = ++requestSeqRef.current;
            setIsLoading(true);
            setSearchError(null);
            setAnswer(null);
            setShowNoMatchHint(false);
            setExtractedTags([]);
            setInterpretationSource(null);

            try {
                const tags = q.split(',').map(t => t.trim()).filter(Boolean).join(',');
                await runGraphRagSearch(tags);
            } catch (error) {
                if (requestSeqRef.current === seq) {
                    console.error("Search failed:", error);
                    setSearchError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
                }
            } finally {
                if (requestSeqRef.current === seq) setIsLoading(false);
            }
            return;
        }

        // 자연어 질의 경로: /canvas/ask 로 태그를 해석한 뒤, /canvas/answer 로 자연어 답변까지
        // 만들어질 때까지 기다렸다가 캔버스 + 태그 칩 + 답변 패널을 한 번에 공개한다.
        // (답변이 늦게 와도 캔버스가 먼저 열려버리면 "빈 캔버스만 보이는" 어색한 순간이 생기므로,
        //  답변 생성까지 하나의 사이클로 묶는다. 단, 답변 생성이 무한정 캔버스를 막지 않도록
        //  아래에서 타임아웃으로 안전장치를 둔다.)
        const seq = ++requestSeqRef.current;
        setIsLoading(true);
        setIsInterpreting(true);
        setSearchError(null);
        setAnswer(null);
        setShowNoMatchHint(false);

        try {
            const response = await askCanvas(q);
            if (requestSeqRef.current !== seq) return; // 더 최신 요청이 진행 중이면 무시

            const tags = response.interpretation?.extracted_tags ?? [];
            const source = response.interpretation?.source ?? null;

            if (tags.length === 0) {
                // 질문을 이해하지 못한 경우: 캔버스는 그대로 두고 힌트만 노출, /answer 호출 안 함
                setExtractedTags(tags);
                setInterpretationSource(source);
                setShowNoMatchHint(true);
                setIsInterpreting(false);
                setIsLoading(false);
                return;
            }

            currentTagsRef.current = tags.join(',');

            const results = response.items || [];
            if (response.status !== "ok" || results.length === 0) {
                // 검색 결과가 없으면 캔버스를 공개할 것이 없으므로 여기서 종료, /answer 호출 안 함
                setSearchError(response.meta?.message || "검색 결과가 없습니다. 다른 태그로 시도해보세요.");
                setIsInterpreting(false);
                setIsLoading(false);
                return;
            }

            // 태그 해석은 끝났지만 답변 생성이 남아있으므로 오버레이 안내 문구를 다음 단계로 전환한다.
            setIsGeneratingAnswer(true);

            // /canvas/answer 는 캔버스 공개와 동시에 보여줄 답변을 만드는 단계라 await로 기다린다.
            // 다만 답변 생성이 캔버스 공개를 무한정 막으면 안 되므로 30초 타임아웃을 두고,
            // 타임아웃되면 답변 없이(answer=null) 캔버스+칩만 공개한다.
            const ANSWER_TIMEOUT_MS = 30000;
            let answerText: string | null = null;
            try {
                answerText = await Promise.race([
                    getCanvasAnswer(q, tags).then((answerRes) => answerRes.answer ?? null),
                    new Promise<null>((resolve) => setTimeout(() => resolve(null), ANSWER_TIMEOUT_MS)),
                ]);
            } catch (error) {
                console.error("[Canvas] getCanvasAnswer 실패", error);
                answerText = null;
            }

            if (requestSeqRef.current !== seq) return; // 늦게 도착한 이전 요청 결과 무시

            // 캔버스 + 태그 칩 + 답변을 한 시점에 함께 공개한다.
            setExtractedTags(tags);
            setInterpretationSource(source);
            populateCanvasFromItems(results);
            setAnswer(answerText);

            setIsInterpreting(false);
            setIsGeneratingAnswer(false);
            setIsLoading(false);
        } catch (error) {
            if (requestSeqRef.current === seq) {
                console.error("Ask failed:", error);
                setSearchError("질문을 해석하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
                setIsInterpreting(false);
                setIsGeneratingAnswer(false);
                setIsLoading(false);
            }
        }
    };

    // 태그 칩 제거: 남은 태그로 기존 /graphrag 경로로 재검색한다.
    // /answer는 다시 호출하지 않는다 (칩 편집은 태그 미세조정 목적이라 이전 답변을 유지해도
    // 무방하다고 판단했지만, 답변이 더 이상 최신 태그와 맞지 않을 수 있으므로 안전하게 숨긴다).
    const handleRemoveTag = async (tagToRemove: string) => {
        const remaining = extractedTags.filter(t => t !== tagToRemove);

        const seq = ++requestSeqRef.current;
        setAnswer(null);
        setSearchError(null);
        setExtractedTags(remaining);

        if (remaining.length === 0) {
            setShowNoMatchHint(true);
            return;
        }

        setShowNoMatchHint(false);
        setIsLoading(true);
        try {
            await runGraphRagSearch(remaining.join(','));
        } catch (error) {
            if (requestSeqRef.current === seq) {
                console.error("Tag removal search failed:", error);
                setSearchError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
            }
        } finally {
            if (requestSeqRef.current === seq) setIsLoading(false);
        }
    };

    const handlePlay = async (album: CanvasAlbum) => {
        // Toggle: if same album is playing, stop it
        if (playingMusic?.album.id === album.id) {
            setPlayingMusic(null);
            return;
        }

        try {
            const url = await playTrack(album.id);
            if (url) {
                setPlayingMusic({ album, url });
            } else {
                alert("음악을 재생할 수 없습니다.");
            }
        } catch (e) {
            console.error("Playback error", e);
        }
    };

    return (
        <motion.div
            className="w-full h-full relative"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} // Decelerate out
        >
            {/* Canvas Background */}
            <InfiniteCanvas
                albums={albums}
                onViewChange={handleViewChange}
                onAlbumClick={setSelectedAlbum}
            />

            {/* Album Detail Overlay */}
            <AnimatePresence>
                {selectedAlbum && (
                    <AlbumDetailOverlay
                        album={selectedAlbum}
                        onClose={() => {
                            setSelectedAlbum(null);
                            setPlayingMusic(null);
                        }}
                        onPlay={() => handlePlay(selectedAlbum)}
                        isPlaying={playingMusic?.album.id === selectedAlbum.id}
                    />
                )}
            </AnimatePresence>

            {playingMusic && (
                <MusicPlayerBar
                    album={playingMusic.album}
                    audioUrl={playingMusic.url}
                    onClose={() => setPlayingMusic(null)}
                />
            )}

            {/* Search Overlay */}
            {showOverlay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 backdrop-blur-md bg-white/30" />

                    {/* Search Box Container */}
                    <form
                        onSubmit={(e) => handleSearch(e)}
                        className="relative z-10 w-full max-w-xl mx-4"
                    >
                        {/* Glassmorphism Search Box - Light Theme */}
                        <div className="bg-white/70 backdrop-blur-2xl border border-white/20 rounded-[32px] p-8 shadow-[0_30px_60px_rgba(0,0,0,0.12)]">
                            <h2 className="text-black/90 text-3xl font-black mb-2 text-center tracking-tight">
                                Music Verse
                            </h2>
                            <p className="text-black/50 text-sm text-center mb-8 font-medium">
                                감성적인 태그로, 또는 자연스러운 문장으로 나만의 음악 우주를 탐험하세요
                            </p>

                            {/* Search Input */}
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="예: summer, dream 또는 비 오는 날 운전할 때 들을 노래"
                                    className="w-full bg-black/[0.03] border border-black/5 rounded-2xl pl-6 pr-14 py-4 text-black placeholder-black/30 focus:outline-none focus:bg-white focus:border-black/10 focus:shadow-lg transition-all text-lg font-medium"
                                    disabled={isLoading}
                                />
                                <button
                                    type="submit"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors disabled:opacity-50 hover:bg-black/5 text-black/60"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <div className="w-6 h-6 border-2 border-black/10 border-t-black/60 rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* 질문 해석 중 / 답변 생성 중 안내 (자연어 질의 한 사이클 동안 단계별로 문구 전환) */}
                            {(isInterpreting || isGeneratingAnswer) && (
                                <div className="mt-4 p-3 rounded-xl bg-black/[0.03] text-black/60 text-center text-sm font-medium animate-fadeIn">
                                    {isGeneratingAnswer ? "답변을 생성하는 중…" : "질문을 해석하는 중…"}
                                </div>
                            )}

                            {/* 질문을 이해하지 못한 경우 안내 */}
                            {showNoMatchHint && (
                                <div className="mt-4 p-3 rounded-xl bg-amber-50 text-amber-700 text-center text-sm font-medium animate-fadeIn">
                                    질문을 이해하지 못했어요. 아래 추천 태그로 시도해보세요.
                                </div>
                            )}

                            {/* Error Message */}
                            {searchError && (
                                <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-500 text-center text-sm font-medium animate-fadeIn">
                                    {searchError}
                                </div>
                            )}

                            {/* Recommended Tags */}
                            <div className="mt-8">
                                <p className="text-xs font-bold text-black/30 uppercase tracking-widest text-center mb-4">
                                    Recommended Tags
                                </p>
                                <div className="flex flex-wrap justify-center gap-2 max-h-[160px] overflow-y-auto pr-2 no-scrollbar mask-gradient-b">
                                    {RECOMMENDED_TAGS.map((tag) => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => handleSearch(undefined, tag)}
                                            className="px-4 py-1.5 rounded-full bg-black/[0.03] hover:bg-black/[0.08] text-sm text-black/60 font-medium transition-all hover:scale-105 active:scale-95 border border-transparent hover:border-black/5"
                                            disabled={isLoading}
                                        >
                                            #{tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Header (shown when overlay is hidden) */}
            {!showOverlay && (
                <>
                    <div className="fixed top-8 left-8 z-40">
                        <h1 className="text-5xl font-bold text-black tracking-tighter shadow-sm pointer-events-none">
                            Music Verse
                        </h1>
                        {extractedTags.length === 0 && (
                            <p className="text-sm text-black/60 mt-1 font-medium pointer-events-none">
                                #{currentTagsRef.current.replace(/,/g, ' #')}
                            </p>
                        )}

                        {/* 자연어 질의로 해석된 태그 칩 (편집/제거 가능) */}
                        {extractedTags.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2 max-w-md pointer-events-auto">
                                {extractedTags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur-xl border border-white/20 shadow-[0_8px_20px_rgba(0,0,0,0.08)] text-sm text-black/70 font-medium"
                                    >
                                        #{tag}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTag(tag)}
                                            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-black/10 text-black/40 hover:text-black/70 transition-colors"
                                            aria-label={`${tag} 태그 제거`}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                                {interpretationSource === "fallback_direct" && (
                                    <span className="inline-flex items-center px-2 py-1 text-[11px] text-black/30 font-medium">
                                        (직접 매칭)
                                    </span>
                                )}
                            </div>
                        )}

                        {/* 질문을 이해하지 못한 경우: 추천 태그 힌트 */}
                        {showNoMatchHint && (
                            <div className="mt-3 max-w-md pointer-events-auto">
                                <p className="text-sm text-amber-700 font-medium mb-2">
                                    질문을 이해하지 못했어요. 추천 태그로 시도해보세요.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {RECOMMENDED_TAGS.slice(0, 8).map((tag) => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => handleSearch(undefined, tag)}
                                            className="px-3 py-1 rounded-full bg-white/70 backdrop-blur-xl border border-white/20 hover:bg-white/90 text-xs text-black/60 font-medium transition-all"
                                        >
                                            #{tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Persistent Search Bar (Top Center) */}
                    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ease-out hover:scale-105">
                        <form
                            onSubmit={(e) => {
                                handleSearch(e);
                                (document.activeElement as HTMLElement)?.blur();
                            }}
                            className="relative group w-[40px] focus-within:w-[320px] transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden rounded-full bg-white/70 backdrop-blur-xl border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-[40px] flex items-center justify-center pointer-events-none z-10">
                                <svg className="w-4 h-4 text-black/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="태그 검색..."
                                className="w-full bg-transparent border-none pl-12 pr-4 py-2.5 text-black placeholder-black/40 focus:outline-none text-sm font-medium h-[40px] opacity-0 focus-within:opacity-100 group-hover:opacity-100 transition-opacity duration-300"
                            />
                        </form>
                    </div>
                </>
            )}

            {/* Navigation Bar (Glassmorphism Button) */}
            <div className="fixed top-8 right-8 z-50">
                <button
                    onClick={() => navigate('/home')}
                    className="px-6 py-3 bg-white/70 backdrop-blur-xl border border-white/20 text-black/90 rounded-full font-bold hover:bg-white/90 transition-all text-sm flex items-center gap-2 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)] hover:scale-105 active:scale-95"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                    Home
                </button>
            </div>

            {/* 자연어 질의 답변 패널 (하단 고정, 캔버스를 가리지 않도록 bottom에만 배치)
                캔버스는 답변 생성이 끝난 시점에만 공개되므로, 이 패널이 보일 때는 answer가
                이미 채워져 있거나(정상) 타임아웃으로 인해 아예 렌더링되지 않는다(안전장치). */}
            <AnimatePresence>
                {!showOverlay && extractedTags.length > 0 && answer && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.3 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 pointer-events-none"
                    >
                        <div className="pointer-events-auto bg-white/70 backdrop-blur-2xl border border-white/20 rounded-3xl px-6 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.15)]">
                            <p className="text-sm text-black/80 font-medium leading-relaxed">
                                {answer}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
