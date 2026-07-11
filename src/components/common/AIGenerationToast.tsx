import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAIGeneration, type UiPhase } from "../../contexts/AIGenerationContext";

const STEPS: { key: string; label: string; phases: UiPhase[] }[] = [
  { key: "prompt", label: "프롬프트 다듬는 중", phases: ["converting"] },
  { key: "song", label: "AI가 곡을 만드는 중", phases: ["generating", "preparing_audio"] },
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
  }, [task]);

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
          className="fixed bottom-[104px] right-6 z-[70] w-[640px] rounded-3xl border border-white/10 bg-[#2d2d2d]/95 backdrop-blur-xl shadow-2xl text-white overflow-hidden"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <span className="text-lg font-semibold">
              {isDone ? "생성 완료" : isFailed ? "생성 실패" : "AI 곡 생성 중"}
            </span>
            <div className="flex items-center gap-2">
              {!isDone && !isFailed && (
                <button
                  onClick={() => setMinimized((m) => !m)}
                  className="text-white/50 hover:text-white text-sm"
                  aria-label="최소화 토글"
                >
                  {minimized ? "▲" : "▼"}
                </button>
              )}
              <button
                onClick={dismiss}
                className="text-white/50 hover:text-white text-sm"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
          </div>

          {!minimized && (
            <div className="px-6 py-5 space-y-4">
              {!isDone && !isFailed && (
                <ul className="space-y-3">
                  {STEPS.map((s) => {
                    const lastIdx = Math.max(...s.phases.map((p) => ORDER.indexOf(p)));
                    const state =
                      currentIndex > lastIdx
                        ? "done"
                        : task && s.phases.includes(task.phase)
                        ? "active"
                        : "pending";
                    return (
                      <li key={s.key} className="flex items-center gap-3 text-base">
                        <span className="w-6 text-center">
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

              {task.convertedPrompt &&
                (task.phase === "generating" || task.phase === "preparing_audio") && (
                  <p className="text-sm text-white/60 leading-relaxed border-t border-white/10 pt-3 whitespace-pre-wrap break-words">
                    {task.convertedPrompt}
                  </p>
                )}

              {isDone && (
                <div className="space-y-3">
                  <p className="text-base text-white/80">
                    곡이 완성되었습니다. 지금 확인해보세요.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (task.musicId) navigate(`/aisong/${task.musicId}`);
                        else navigate("/my/ai-songs");
                        dismiss();
                      }}
                      className="flex-1 rounded-lg bg-white text-black text-base font-semibold py-3 hover:bg-white/90"
                    >
                      보러가기
                    </button>
                    <button
                      onClick={dismiss}
                      className="rounded-lg border border-white/20 text-base py-3 px-4 hover:bg-white/10"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              )}

              {isFailed && (
                <div className="space-y-3">
                  <p className="text-base text-red-300">
                    {task.error ?? "생성에 실패했습니다."}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={retry}
                      className="flex-1 rounded-lg bg-white text-black text-base font-semibold py-3 hover:bg-white/90"
                    >
                      다시 시도
                    </button>
                    <button
                      onClick={dismiss}
                      className="rounded-lg border border-white/20 text-base py-3 px-4 hover:bg-white/10"
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
