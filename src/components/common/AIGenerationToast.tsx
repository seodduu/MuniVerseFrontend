import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAIGeneration, type UiPhase } from "../../contexts/AIGenerationContext";

const STEPS: { phase: UiPhase; label: string }[] = [
  { phase: "converting", label: "프롬프트 다듬는 중" },
  { phase: "generating", label: "AI가 곡을 만드는 중" },
  { phase: "preparing_audio", label: "오디오 저장 중" },
];

const ORDER: UiPhase[] = ["converting", "generating", "preparing_audio", "completed"];

export default function AIGenerationToast() {
  const { task, dismiss, retry } = useAIGeneration();
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (task && (task.phase === "completed" || task.phase === "failed")) {
      setMinimized(false);
    }
  }, [task?.phase]);

  const currentIndex = task ? ORDER.indexOf(task.phase) : -1;
  const isDone = task?.phase === "completed";
  const isFailed = task?.phase === "failed";

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          key="ai-gen-toast"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="fixed bottom-[104px] right-6 z-[70] w-[320px] rounded-2xl border border-white/10 bg-[#2d2d2d]/95 backdrop-blur-xl shadow-2xl text-white overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-semibold">
              {isDone ? "생성 완료" : isFailed ? "생성 실패" : "AI 곡 생성 중"}
            </span>
            <div className="flex items-center gap-2">
              {!isDone && !isFailed && (
                <button
                  onClick={() => setMinimized((m) => !m)}
                  className="text-white/50 hover:text-white text-xs"
                  aria-label="최소화 토글"
                >
                  {minimized ? "▲" : "▼"}
                </button>
              )}
              <button
                onClick={dismiss}
                className="text-white/50 hover:text-white text-xs"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
          </div>

          {!minimized && (
            <div className="px-4 py-3 space-y-3">
              {!isDone && !isFailed && (
                <ul className="space-y-2">
                  {STEPS.map((s) => {
                    const stepIdx = ORDER.indexOf(s.phase);
                    const state =
                      stepIdx < currentIndex
                        ? "done"
                        : stepIdx === currentIndex
                        ? "active"
                        : "pending";
                    return (
                      <li key={s.phase} className="flex items-center gap-2 text-sm">
                        <span className="w-4 text-center">
                          {state === "done" ? "✓" : state === "active" ? "⏳" : "•"}
                        </span>
                        <span
                          className={
                            state === "pending" ? "text-white/40" : "text-white"
                          }
                        >
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {isDone && (
                <div className="space-y-3">
                  <p className="text-sm text-white/80">
                    곡이 완성되었습니다. 지금 확인해보세요.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (task.musicId) navigate(`/aisong/${task.musicId}`);
                        else navigate("/my/ai-songs");
                        dismiss();
                      }}
                      className="flex-1 rounded-lg bg-white text-black text-sm font-semibold py-2 hover:bg-white/90"
                    >
                      보러가기
                    </button>
                    <button
                      onClick={dismiss}
                      className="rounded-lg border border-white/20 text-sm py-2 px-3 hover:bg-white/10"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}

              {isFailed && (
                <div className="space-y-3">
                  <p className="text-sm text-red-300">
                    {task.error ?? "생성에 실패했습니다."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={retry}
                      className="flex-1 rounded-lg bg-white text-black text-sm font-semibold py-2 hover:bg-white/90"
                    >
                      다시 시도
                    </button>
                    <button
                      onClick={dismiss}
                      className="rounded-lg border border-white/20 text-sm py-2 px-3 hover:bg-white/10"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
