import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from 'react-router-dom';
import InfiniteCanvas from "../../components/canvas/InfiniteCanvas";
import AlbumDetailOverlay from "../../components/canvas/AlbumDetailOverlay";
import MusicPlayerBar from "../../components/canvas/MusicPlayerBar";
import { searchCanvasGraphRag, getCanvasAlbums, playTrack, type CanvasAlbum, type CanvasGraphRagItem } from "../../api/music";

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

    // Cache for search results
    const searchCacheRef = useRef<CanvasAlbum[]>([]);
    const loadedChunksRef = useRef<Set<string>>(new Set());
    const currentTagsRef = useRef<string>("");
    const initialLoadDoneRef = useRef(false);

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

    // Handle search submission
    const handleSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
        if (e) e.preventDefault();

        const q = overrideQuery || searchQuery;
        if (!q.trim()) return;

        setIsLoading(true);
        setSearchError(null); // 에러 초기화

        try {
            // Parse tags (comma-separated)
            const tags = q.split(',').map(t => t.trim()).filter(Boolean).join(',');
            currentTagsRef.current = tags;
            if (overrideQuery) setSearchQuery(overrideQuery);

            // Fetch GraphRAG results
            const response = await searchCanvasGraphRag(tags, 120);
            const results = response.items || [];

            if (response.status !== "ok" || results.length === 0) {
                setSearchError(response.meta?.message || "검색 결과가 없습니다. 다른 태그로 시도해보세요.");
                setIsLoading(false);
                return;
            }

            // Convert to CanvasAlbum format
            const canvasAlbums = results
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
        } catch (error) {
            console.error("Search failed:", error);
            setSearchError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        } finally {
            setIsLoading(false);
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
                                감성적인 태그로 나만의 음악 우주를 탐험하세요
                            </p>

                            {/* Search Input */}
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="무드나 장르를 입력하세요 (예: summer, dream)"
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
                    <div className="fixed top-8 left-8 z-40 pointer-events-none">
                        <h1 className="text-5xl font-bold text-black tracking-tighter shadow-sm">
                            Music Verse
                        </h1>
                        <p className="text-sm text-black/60 mt-1 font-medium">
                            #{currentTagsRef.current.replace(/,/g, ' #')}
                        </p>
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
        </motion.div>
    );
}
