// src/pages/ai/AiCreatePage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { usePlayer } from "../../player/PlayerContext";
import type { PlayerTrack } from "../../player/PlayerContext";
import type { AiTrack } from "../../mocks/aiSongMock";

import { listAllAiMusic, getMusicDetail } from "../../api/music";
import { getBestAlbumCover } from "../../api/album";
import { getCurrentUserId } from "../../utils/auth";
import { useAIGeneration } from "../../contexts/AIGenerationContext";

import { Typewriter } from "../../components/Typewriter/Typewriter";
import { CursorStyle } from "../../components/Typewriter/types";

import {
  listMyPlaylists,
  addPlaylistItems,
  type PlaylistSummary,
} from "../../api/playlist";

import {
  MdSearch,
  MdPlaylistAdd,
  MdShare,
  MdMusicNote,
  MdAdd,
  MdOutlineNavigateNext,
} from "react-icons/md";
import { IoChevronBack, IoShuffle } from "react-icons/io5";
import { FaPlay } from "react-icons/fa6";

function PillButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="
        shrink-0 px-4 py-2 rounded-2xl outline outline-1 outline-offset-[-1px] outline-stone-500
        text-base transition flex items-center gap-2
        disabled:text-white/30 disabled:cursor-not-allowed disabled:hover:bg-transparent
        hover:bg-[#f6f6f6]/10"
    >
      <span className="text-base">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export default function AiCreatePage() {
  const navigate = useNavigate();
  const { playTracks } = usePlayer();
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [sp, setSp] = useSearchParams();
  const appliedRef = useRef(false);
  const backScrollRef = useRef<HTMLDivElement | null>(null);
  const backContentRef = useRef<HTMLDivElement | null>(null);
  const frontScrollRef = useRef<HTMLDivElement | null>(null);
  const frontContentRef = useRef<HTMLDivElement | null>(null);


  /** =========================
   * ✅ 커버 업로드
   ========================= */
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl);
    };
  }, [coverUrl]);

  const onPickCover = () => {
    fileRef.current?.click();
  };

  const onCoverChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있어요.");
      e.target.value = "";
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("파일 용량은 5MB 이하로 업로드해 주세요.");
      e.target.value = "";
      return;
    }

    const url = URL.createObjectURL(file);
    setCoverUrl(url);
    e.target.value = "";
  };

  /** =========================
   * ✅ 좌측 입력
   ========================= */
  const [prompt, setPrompt] = useState("");
  const maxPrompt = 1500;
  const promptCardRef = useRef<HTMLDivElement | null>(null);

  const [makeInstrumental, setMakeInstrumental] = useState(false);

  const [displayText, setDisplayText] = useState<string>("");
  const [typewriterTrigger, setTypewriterTrigger] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // ✅ 전역 AI 생성 컨텍스트 — 생성/폴링/완료 처리를 전부 위임
  const { task: genTask, isActive: genActive, startGeneration } = useAIGeneration();
  const genBusy = genActive || genTask?.phase === "converting";
  const genCompleted = genTask?.phase === "completed";
  const genConverted = genTask?.convertedPrompt ?? "";
  const genError = genTask?.phase === "failed" ? genTask?.error ?? null : null;

  useEffect(() => {
    const incoming = sp.get("prompt");
    if (!incoming) return;

    // 생성 중/완료 중이면 덮어쓰기 방지
    if (genBusy || genCompleted) return;

    // 한번만 적용 (사용자가 수정하는 거 덮어쓰면 안 됨)
    if (appliedRef.current) return;
    appliedRef.current = true;

    setPrompt(incoming.slice(0, maxPrompt));

    // ✅ 시점 이동 (스크롤)
    requestAnimationFrame(() => {
      promptCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });

    // URL 깔끔하게 정리 (선택이지만 강추)
    sp.delete("prompt");
    setSp(sp, { replace: true });
  }, [sp, setSp, genBusy, genCompleted, maxPrompt]);

  useEffect(() => {
    const scroller = backScrollRef.current;
    const content = backContentRef.current;
    if (!scroller || !content) return;

    const stickToBottom = () => {
      scroller.scrollTop = scroller.scrollHeight;
    };

    // 시작 시 한번
    stickToBottom();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(stickToBottom);
    });

    ro.observe(content);
    return () => ro.disconnect();
  }, [typewriterTrigger, displayText]);

  useEffect(() => {
    const scroller = frontScrollRef.current;
    const content = frontContentRef.current;
    if (!scroller || !content) return;

    const stickToBottom = () => {
      scroller.scrollTop = scroller.scrollHeight;
    };

    stickToBottom();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(stickToBottom);
    });

    ro.observe(content);
    return () => ro.disconnect();
  }, [prompt]);


  // 사용자가 입력을 변경할 때 (변환 결과가 없을 때만 사용자 입력 표시)
  useEffect(() => {
    if (genBusy) return;

    // 변환 결과가 있으면 유지
    if (genConverted) return;

    // 생성 완료 상태일 때는 카드를 뒤집지 않음
    if (genCompleted) return;

    // 변환 결과가 없을 때 카드를 앞면으로
    setIsFlipped(false);

    // 변환 결과가 없을 때만 사용자 입력 표시
    if (prompt) setDisplayText(prompt);
    else setDisplayText("");
  }, [prompt, genBusy, genConverted, genCompleted]);

  // ✅ 전역 생성 작업(genTask)의 단계 변화를 카드 뒷면 문구에 동기화
  useEffect(() => {
    if (!genTask) return;
    if (genTask.phase === "converting") {
      setDisplayText("프롬프트 변환 중....\n잠시 기다려 주세요");
    } else if (genTask.convertedPrompt && genTask.phase === "generating") {
      setDisplayText(genTask.convertedPrompt);
    } else if (genTask.phase === "completed") {
      setDisplayText("생성이 완료되었습니다.\n우측 하단 알림에서 확인하세요.");
    } else if (genTask.phase === "failed") {
      setDisplayText(genTask.error ?? "생성에 실패했습니다.");
    }
    setTypewriterTrigger((prev) => prev + 1);
  }, [genTask?.phase, genTask?.convertedPrompt, genTask?.error]);

  // Typewriter 설정
  const typewriterConfig = {
    speed: 50,
    startDelay: 0,
    cursorChar: CursorStyle.None,
    cursorBlinkSpeed: 0.8,
    smoothness: 0.3,
    loop: false,
  };

  /** =========================
   * ✅ 우측 리스트
   ========================= */
  const [query, setQuery] = useState("");
  const [allRows, setAllRows] = useState<AiTrack[]>([]); // 전체(검색용)
  const [rows, setRows] = useState<AiTrack[]>([]);       // 화면 기본(최신 200)
  const [listLoading, setListLoading] = useState(false);

  const formatDuration = (seconds: number): string => {
    if (!seconds || Number.isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatKoreanDate = (dateString: string): string => {
    try {
      const d = new Date(dateString);
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    } catch {
      return dateString ?? "";
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setListLoading(true);

        const allData = await listAllAiMusic({ is_ai: true });
        if (!allData || !Array.isArray(allData)) {
          setRows([]);
          setAllRows([]);
          return;
        }

        const validData = allData.filter((m) => m.duration != null && m.duration > 0);

        const uniqData = Array.from(
          new Map(validData.map((m) => [m.music_id, m])).values()
        );

        const sorted = [...uniqData].sort((a, b) => {
          const at = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bt - at;
        });

        // ✅ 전체(검색용)
        const allRaw = sorted;

        // ✅ 기본(화면 표시용): 최근 200개만
        const baseRaw = sorted.slice(0, 50);

        // ✅ 커버 + AiTrack 매핑 함수
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapOne = async (m: any): Promise<AiTrack> => {
          let coverUrl: string | undefined;

          try {
            const musicDetail = await getMusicDetail(m.music_id);

            if (musicDetail) {
              if (musicDetail.image_square) coverUrl = musicDetail.image_square;
              else if (musicDetail.image_large_square) coverUrl = musicDetail.image_large_square;
              else if (musicDetail.album_image) coverUrl = musicDetail.album_image;
              else if (musicDetail.album_id) {
                const albumCover = await getBestAlbumCover(musicDetail.album_id, null);
                coverUrl = albumCover || undefined;
              }
            }
          } catch {
            // ignore
          }

          return {
            musicId: m.music_id,
            status: (m.audio_url ? "Upload" : "Draft") as AiTrack["status"],
            title: m.music_name || "제목 없음",
            desc: m.lyrics || m.genre || "",
            duration: formatDuration(m.duration ?? 0),
            createdAt: m.created_at ? formatKoreanDate(m.created_at) : "",
            isAi: m.is_ai ?? true,
            artist: m.artist_name || "AI Artist",
            plays: 0,
            lyrics: m.lyrics || "",
            coverUrl,
            audioUrl: m.audio_url || undefined,
            prompt: "",
            ownerId: undefined,
            ownerName: undefined,
          };
        };

        // ✅ base(200개) 먼저 만들어서 빠르게 화면 표시
        const baseMapped = await Promise.all(baseRaw.map(mapOne));
        setRows(baseMapped);

        // ✅ 전체는 뒤에서 계속 로드(검색 정확도 위해)
        const allMapped = await Promise.all(allRaw.map(mapOne));
        setAllRows(allMapped);

      } catch {
        setRows([]);
        setAllRows([]);
      } finally {
        setListLoading(false);
      }
    };

    load();
  }, []);



  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    // ✅ 검색어 없으면: 최신 200개(커버 있는 rows)
    if (!q) return rows;

    // ✅ 검색어 있으면: 전체(allRows)에서 검색
    const base = allRows;
    const result = base.filter(
      (r) => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)
    );

    return result;
  }, [query, rows, allRows]);

  /** =========================
   * ✅ 선택 체크
   ========================= */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const visibleIds = useMemo(() => filtered.map((r) => r.musicId), [filtered]);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someChecked = visibleIds.some((id) => selected.has(id)) && !allChecked;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  /** =========================
   * ✅ 생성: 실제 백엔드 API 호출
   ========================= */
  const handleCreateSong = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || genActive) return;

    const userId = getCurrentUserId();
    if (userId === null) {
      alert("로그인이 필요합니다.");
      navigate("/login");
      return;
    }

    // 전역 컨텍스트에 위임 — 페이지를 벗어나도 우하단 토스트가 진행도를 추적
    setIsFlipped(true);
    setDisplayText("프롬프트 변환 중....\n잠시 기다려 주세요");
    setTypewriterTrigger((prev) => prev + 1);

    await startGeneration({ prompt: trimmed, makeInstrumental });
  };

  /** =========================
   * ✅ 선택된 row → PlayerTrack
   ========================= */
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.musicId)), [rows, selected]);

  const toTrack = (r: AiTrack): PlayerTrack => ({
    id: r.musicId.toString(),
    title: r.title,
    artist: r.artist ?? "AI Artist",
    duration: r.duration,
    audioUrl: r.audioUrl,
    musicId: r.musicId,
    coverUrl: r.coverUrl, // ✅ 커버 이미지 추가
    albumId: undefined, // AI 곡은 앨범 ID가 없을 수 있음 (필요 시 r.albumId 추가)
  });

  const selectedTracks = useMemo(() => selectedRows.map(toTrack), [selectedRows]);
  const selectedCount = selectedTracks.length;

  /** =========================
   * ✅ 담기 모달
   ========================= */
  const [addOpen, setAddOpen] = useState(false);
  const [addTargets, setAddTargets] = useState<PlaylistSummary[]>([]);

  useEffect(() => {
    // 플레이리스트 목록 로드 (Real API)
    const loadPlaylists = async () => {
      try {
        const myPlaylists = await listMyPlaylists();
        setAddTargets(myPlaylists);
      } catch (err) {
        console.error("Failed to load user playlists:", err);
      }
    };

    if (addOpen) {
      loadPlaylists();
    }
  }, [addOpen]);

  const addSelectedToPlaylist = async (playlistId: number) => {
    if (selectedCount === 0) return;

    try {
      // 선택된 musicId들 추출
      const musicIds = selectedRows.map(r => r.musicId);

      // API 호출
      await addPlaylistItems(playlistId, musicIds);

      alert("플레이리스트에 곡을 추가했습니다.");
      setAddOpen(false);
      setSelected(new Set());
    } catch (err) {
      console.error("Failed to add tracks to playlist:", err);
      alert("플레이리스트 추가에 실패했습니다.");
    }
  };

  /** =========================
   * ✅ 공유
   ========================= */
  const shareSelected = async () => {
    if (selectedCount === 0) return;

    const text = selectedRows.map((r) => `- ${r.title} (${r.duration})`).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "AI 곡 공유", text });
        return;
      }
    } catch {
      // ignore
    }

    try {
      await navigator.clipboard.writeText(text);
      alert("선택한 곡 목록을 클립보드에 복사했어요!");
    } catch {
      alert("공유에 실패했어요. (클립보드 권한 확인)");
    }
  };

  type ActionKey = "play" | "shuffle" | "add" | "share";

  const handleAction = (key: ActionKey) => {
    if (selectedCount === 0) return;

    if (key === "play") playTracks(selectedTracks);
    if (key === "shuffle") playTracks(selectedTracks, { shuffle: true });
    if (key === "add") setAddOpen(true);
    if (key === "share") shareSelected();
  };

  const goToAlSongPage = (trackId: number) => {
    navigate(`/aisong/${trackId}`);
  };

  return (
    <div className="w-full h-full overflow-x-auto">
      <style>{`
        @keyframes aiGradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ai-back-gradient {
            animation: none !important;
          }
        }

        /* 텍스트 선택 하이라이트 숨기기 */
        .ai-prompt-textarea::selection { background: transparent; }
        .ai-prompt-textarea::-moz-selection { background: transparent; }
      `}</style>

      <div className="grid h-[100dvh] items-stretch grid-cols-[minmax(360px,0.95fr)_minmax(520px,1.05fr)] gap-6">
        {/* ===================== 좌측: 생성 폼 ===================== */}
        <section>
          {/* 상단: 뒤로가기 + 타이틀 */}
          <div className="flex pt-2 place-items-start">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="뒤로가기"
              className="p-2 text-[#f6f6f6] rounded-full hover:bg-white/10 transition"
            >
              <IoChevronBack size={24} />
            </button>

            <div className="flex-1 flex justify-center">
              <h1 className="mr-10 mt-10 text-3xl font-bold leading-tight tracking-widest text-[#f6f6f6]">
                나만의 노래를
                <br />
                AI로 만들어보세요!
              </h1>
            </div>
          </div>

          {/* 커버 업로드 카드 */}
          <div className="mt-14 flex flex-col items-center">
            <button
              type="button"
              onClick={onPickCover}
              className="w-72 h-72 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] bg-white/[0.05] backdrop-blur-2xl border border-white/10 hover:bg-white/[0.1] hover:border-white/20 transition-all duration-500 flex flex-col items-center justify-center overflow-hidden group/cover"
              aria-label="add cover"
            >
              {coverUrl ? (
                <img src={coverUrl} alt="cover preview" className="h-full w-full object-cover transition-transform duration-1000 group-hover/cover:scale-110" />
              ) : (
                <>
                  <div className="text-white/40 group-hover/cover:text-[#f6f6f6] transition-colors">
                    <MdAdd size={40} />
                  </div>
                </>
              )}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover/cover:opacity-100 transition-opacity pointer-events-none" />
            </button>
          </div>

          <div>
            <p className="mt-4 text-xs font-semibold tracking-tight text-center text-white/20 uppercase">
              커버 사진을 추가하지 않아도 AI가 자동으로 생성해줍니다.
            </p>
          </div>

          {/* 실제 업로드 input */}
          <input ref={fileRef} type="file" accept="image/*" onChange={onCoverChange} className="hidden" />

          {/* 프롬프트 카드 - 플립 애니메이션 (투명 유리 스타일 적용) */}
          <div
            ref={promptCardRef}
            className="mt-10 mx-6 [perspective:1000px] h-[350px]">
            <div
              className={`relative w-full h-full transition-transform duration-600 ease-in-out [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""
                }`}
              style={{ transition: "transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }}
            >
              {/* 앞면: 사용자 입력 */}
              <div
                className="
                  absolute inset-0 [backface-visibility:hidden]
                  rounded-[40px] bg-white/[0.05] backdrop-blur-2xl
                  border border-white/10
                  shadow-[0_30px_80px_rgba(0,0,0,0.5)] p-8
                  overflow-hidden
                  
                  transition-all duration-300
                  focus-within:border-white/30
                  focus-within:shadow-[0_40px_100px_rgba(0,0,0,0.6)]
                  "
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="relative flex flex-col items-center justify-center min-h-full">
                  <div className="absolute top-0 left-0 text-xs text-white/20">
                    {prompt ? "사용자 입력" : "프롬프트 입력"}
                  </div>

                  {/* Typewriter 애니메이션 표시 영역 */}
                  <div
                    ref={frontScrollRef}
                    className="relative w-full flex flex-col items-center justify-center min-h-[220px] max-h-[220px] overflow-y-auto no-scrollbar">
                    {prompt ? (
                      <div
                        ref={frontContentRef}
                        className="
                          w-full flex flex-col text-lg font-bold
                          items-center justify-center
                          whitespace-pre-wrap break-words
                          leading-relaxed px-4 text-white/90"
                      >
                        <Typewriter text={prompt} config={typewriterConfig} triggerReplay={0} />
                      </div>
                    ) : (
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white/10 text-base text-center w-full tracking-widest leading-loose">
                        어떤 분위기의 노래를<br />만들고 싶으신가요?
                      </div>
                    )}
                  </div>

                  {/* 실제 입력을 받는 textarea */}
                  <textarea
                    value={prompt}
                    onChange={(e) => {
                      const newValue = e.target.value.slice(0, maxPrompt);
                      setPrompt(newValue);
                    }}
                    placeholder="예) 새벽 감성, 로파이 힙합, 잔잔한 피아노와 드럼, 한국어 보컬..."
                    className="
                      ai-prompt-textarea absolute
                      inset-0 w-full h-full resize-none
                      bg-transparent text-lg text-transparent
                      outline-none placeholder:text-transparent
                      font-bold leading-relaxed text-center
                      overflow-y-auto no-scrollbar
                    "
                    style={
                      {
                        caretColor: "transparent",
                        zIndex: 10,
                        pointerEvents: "auto",
                      } as CSSProperties
                    }
                    disabled={genBusy}
                  />

                  {/* 글자 수 표시 */}
                  <div className="absolute bottom-0 right-0 text-right text-xs text-white/20 tracking-tighter z-20">
                    {prompt.length} / {maxPrompt}
                  </div>
                </div>
              </div>

              {/* 뒷면: 변환 결과 */}
              <div
                className="ai-back-gradient absolute inset-0 [backface-visibility:hidden] rounded-[40px] backdrop-blur-3xl border border-white/20 shadow-[0_40px_100px_rgba(0,0,0,0.7)] p-8 overflow-hidden [transform:rotateY(180deg)]"
                style={{
                  backfaceVisibility: "hidden",
                  backgroundImage:
                    "radial-gradient(1200px circle at 10% 20%, rgba(107,115,255,0.4), transparent 45%), radial-gradient(900px circle at 85% 25%, rgba(175,222,226,0.35), transparent 50%), radial-gradient(900px circle at 40% 85%, rgba(255,89,169,0.25), transparent 55%), linear-gradient(135deg, rgba(10,10,10,0.95), rgba(20,20,20,0.98))",
                  backgroundSize: "200% 200%",
                  animation: "aiGradientShift 8s ease-in-out infinite",
                }}
              >
                <div className="relative flex flex-col items-center justify-center h-full min-h-0">
                  <div className="absolute top-0 left-0 text-[10px] font-black tracking-[0.2em] text-white/30 uppercase">
                    {genBusy && !genConverted ? "Processing..." : genConverted ? "Enhanced Result" : ""}
                  </div>

                  <div
                    ref={backScrollRef}
                    className={[
                      "relative w-full flex flex-col min-h-[250px] max-h-[250px] overflow-y-auto px-4 no-scrollbar",
                      genBusy && !genConverted
                        ? "items-center justify-center text-center"
                        : "items-center justify-start pt-[20px]",
                    ].join(" ")}
                  >
                    {displayText ? (
                      <div
                        ref={backContentRef}
                        className="whitespace-pre-wrap break-words leading-relaxed text-white/90 font-bold">
                        <Typewriter
                          text={displayText}
                          config={typewriterConfig}
                          triggerReplay={typewriterTrigger}
                        />
                      </div>
                    ) : (
                      <div className="text-[#AFDEE2]/20 text-2xl font-black uppercase tracking-tighter text-center">
                        {genBusy ? "Creating..." : "Result will appear here"}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          </div>

          {/* make_instrumental 체크박스 */}
          <label className="mt-4 mx-10 pt-2 border-t border-white/5 flex items-center gap-3 text-xs text-white/30 cursor-pointer hover:text-white/50 transition-colors">
            <input
              type="checkbox"
              checked={makeInstrumental}
              onChange={(e) => setMakeInstrumental(e.target.checked)}
              disabled={genBusy}
              className="accent-[#f6f6f6] w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
            />
            <span>보컬 없이 연주곡(Instrumental)으로 만들기</span>
          </label>

          {/* 버튼들 */}
          <div className="mt-8 mb-10 flex flex-col items-center gap-4">
            <button
              type="button"
              disabled={!prompt.trim() || genBusy}
              onClick={handleCreateSong}
              className="
                px-10 py-4
                rounded-2xl
                text-base font-bold
                bg-[#AFDEE2]
                text-[#1d1d1d]
                hover:bg-[#87B2B6]
                hover:scale-105
                active:scale-[0.95]
                transition-all duration-300
                shadow-[0_10px_30px_rgba(175,222,226,0.3)]
                disabled:bg-white/5
                disabled:text-white/20
                disabled:border-white/5
                disabled:shadow-none
                disabled:cursor-not-allowed
                disabled:active:scale-100"
            >
              <div className="flex gap-3 items-center">
                {genBusy ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center" aria-hidden="true">
                    <span className="h-5 w-5 rounded-full border-2 border-[#1d1d1d]/30 border-t-[#1d1d1d] animate-spin" />
                  </span>
                ) : (
                  <MdMusicNote size={22} />
                )}
                <span className="whitespace-nowrap">
                  {genBusy ? "AI 노래 생성 중..." : genCompleted ? "생성 완료" : "AI 노래 생성하기"}
                </span>
              </div>
            </button>

            {genError && <p className="text-center text-[11px] font-bold text-red-400/80 max-w-[300px] uppercase tracking-tight">{genError}</p>}
          </div>
        </section>

        {/* ===================== 우측: 리스트/테이블 ===================== */}
        {/* ===================== 우측: 리스트/테이블 ===================== */}
        <aside className="col-span-1 rounded-[40px] border border-white/10 bg-white/[0.05] backdrop-blur-2xl p-0 overflow-hidden whitespace-nowrap mb-6 mr-6">
          {/* 상단 헤더 (ChartTop100 스타일) */}
          <div className="px-8 py-6 border-b border-white/10">
            {/* 검색바 */}
            <div className="flex items-center gap-4 rounded-full bg-white/5 border border-white/10 px-6 py-3 text-white/30 focus-within:border-white/20 transition-all">
              <MdSearch size={20} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="AI 곡 검색하기"
                className="w-full bg-transparent text-white text-base outline-none placeholder:text-white/20 tracking-tight"
              />
            </div>

            {/* 액션 버튼들 */}
            <div className="mt-4 flex items-center justify-between gap-4 text-white">
              <div className="flex flex-nowrap gap-3">
                <PillButton
                  icon={<FaPlay />}
                  label="재생"
                  onClick={() => handleAction("play")}
                  disabled={selectedCount === 0}
                />
                <PillButton
                  icon={<IoShuffle size={22} />}
                  label="셔플"
                  onClick={() => handleAction("shuffle")}
                  disabled={selectedCount === 0}
                />
                <PillButton
                  icon={<MdPlaylistAdd size={22} />}
                  label="담기"
                  onClick={() => handleAction("add")}
                  disabled={selectedCount === 0}
                />
                <PillButton
                  icon={<MdShare size={18} />}
                  label="공유"
                  onClick={() => handleAction("share")}
                  disabled={selectedCount === 0}
                />
              </div>

              <button
                type="button"
                onClick={() => navigate("/my/ai-songs")}
                className="
                  shrink-0 flex items-center text-base font-semibold tracking-widest uppercase
                  text-white/40 hover:text-[#f6f6f6] transition-all
                "
                aria-label="나의 AI 생성곡 목록으로 이동"
                title="나의 AI 생성곡 목록"
              >
                나의 AI 생성곡
                <MdOutlineNavigateNext size={24} className="ml-1 opacity-60" />
              </button>
            </div>
          </div>

          {/* 테이블 헤더 */}
          <div>
            <div className="grid grid-cols-[70px_1fr_120px_160px] items-center py-3 px-4 text-base text-[#f6f6f6]/30">
              <div className="pl-5 flex items-center justify-start">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAllVisible}
                  aria-label="select all"
                  className="accent-[#AFDEE2] w-4 h-4 cursor-pointer"
                />
              </div>
              <div className="border-l border-white/10 pl-4">곡정보</div>
              <div className="pl-4 text-center">길이</div>
              <div className="pl-4 text-right pr-4">생성일시</div>
            </div>
            <div className="border-b border-white/10" />
          </div>

          {/* 리스트 영역 (스크롤) */}
          <div
            ref={listScrollRef}
            onScroll={(e) => setShowScrollTop(e.currentTarget.scrollTop > 300)}
            className="h-[calc(100%-168px)] overflow-y-auto no-scrollbar"
          >
            {listLoading ? (
              <div className="px-8 py-20 text-center text-sm tracking-widest text-white/20 uppercase whitespace-normal">
                로딩 중...
              </div>
            ) : (
              <div className="divide-y divide-white/10">
                {filtered.map((r, idx) => (
                  <div
                    key={r.musicId}
                    className={[
                      "group grid grid-cols-[70px_1fr_120px_160px] items-center px-4 py-2",
                      "transition-all duration-300 hover:bg-white/[0.08]",
                      idx % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent",
                    ].join(" ")}
                  >
                    {/* 체크 */}
                    <div className="pl-5 flex items-center justify-start">
                      <input
                        type="checkbox"
                        checked={selected.has(r.musicId)}
                        onChange={() => toggleOne(r.musicId)}
                        aria-label={`select ${r.title}`}
                        className="accent-[#AFDEE2] w-4 h-4 cursor-pointer"
                      />
                    </div>

                    {/* 곡정보 */}
                    <div className="pl-4 min-w-0 border-l border-white/10">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="relative h-14 w-14 rounded-lg bg-white/10 shrink-0 overflow-hidden group-hover:scale-105 transition-transform duration-500">
                          {r.coverUrl ? (
                            <>
                              <img
                                src={r.coverUrl}
                                alt={r.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = "block";
                                }}
                              />
                              <div className="hidden w-full h-full bg-white/5" />
                            </>
                          ) : (
                            <div className="w-full h-full bg-white/5" />
                          )}

                          {/* hover overlay */}
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>

                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => goToAlSongPage(r.musicId)}
                            className="block w-full truncate text-left text-base text-[#f6f6f6]/95 group-hover:text-[#AFDEE2] transition-colors"
                          >
                            {r.title}
                          </button>
                          <div className="truncate text-sm text-white/40">
                            {r.desc || r.artist || "AI"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 길이 */}
                    <div className="pl-4 text-center text-base text-[#f6f6f6]/40 tabular-nums group-hover:text-white/60 transition-colors">
                      {r.duration}
                    </div>

                    {/* 생성일시 */}
                    <div className="pl-4 pr-4 text-right text-base text-[#f6f6f6]/30 tabular-nums group-hover:text-white/50 transition-colors">
                      {r.createdAt}
                    </div>
                  </div>
                ))}

                {filtered.length === 0 && (
                  <div className="px-8 py-20 text-center text-sm font-black tracking-widest text-white/20 uppercase whitespace-normal">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 맨 위로 */}
          {showScrollTop && (
            <button
              type="button"
              onClick={() => listScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
              className="
                absolute w-10 h-10 text-center bottom-6 right-6 z-20
                rounded-full bg-[#AFDEE2]/50 text-[#f6f6f6]
                shadow-lg hover:bg-[#87B2B6]/50
                active:scale-95 transition
              "
              aria-label="목록 맨 위로"
              title="맨 위로"
            >
              ↑
            </button>
          )}
        </aside>


        {/* ✅ 담기 모달 */}
        {addOpen && (
          <div className="fixed inset-0 z-[999] whitespace-normal">
            <button type="button" className="absolute inset-0 bg-black/50" onClick={() => setAddOpen(false)} aria-label="닫기" />
            <div className="absolute inset-0 grid place-items-center p-6">
              <div className="w-full max-w-[420px] rounded-3xl bg-[#2d2d2d] border border-[#464646] shadow-2xl overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#464646]">
                  <div className="text-base font-semibold text-[#F6F6F6]">플레이리스트 선택</div>
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="text-[#F6F6F6]/70 hover:text-white transition"
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                </div>

                <div className="px-6 py-4 text-sm text-[#F6F6F6]/70">선택한 {selectedCount}곡을 담을 플레이리스트를 골라주세요</div>

                <div className="max-h-[360px] overflow-y-auto border-t border-[#464646]">
                  {addTargets.length === 0 ? (
                    <div className="px-6 py-6 text-sm text-[#aaa]">
                      담을 수 있는 플레이리스트가 없어요.
                      <div className="mt-2 text-xs text-[#777]">(liked 같은 시스템 플리는 제외됨)</div>
                    </div>
                  ) : (
                    addTargets.map((p) => (
                      <button
                        key={p.playlist_id}
                        type="button"
                        onClick={() => addSelectedToPlaylist(p.playlist_id)}
                        className="w-full text-left px-6 py-4 hover:bg-white/5 transition border-b border-[#464646]"
                      >
                        <div className="text-sm font-semibold text-[#F6F6F6] truncate">{p.title}</div>
                        <div className="mt-1 text-xs text-[#F6F6F6]/60 truncate">
                          {p.creator_nickname} · {p.visibility === "public" ? "공개" : "비공개"}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="px-6 py-4 border-t border-[#464646] flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAddOpen(false)}
                    className="px-4 py-2 rounded-2xl text-sm text-[#F6F6F6] hover:bg-white/10 transition"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
