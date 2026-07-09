import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import {
  convertPromptOnly,
  generateMusicAsync,
  getActiveGeneration,
  getGenerationJob,
  type GenerationJobResponse,
  type GenerationPhase,
} from "../api/ai";
import { getCurrentUserId } from "../utils/auth";

export type UiPhase = "converting" | GenerationPhase;

export interface AIGenerationTask {
  jobId?: number;
  phase: UiPhase;
  originalPrompt: string;
  convertedPrompt?: string;
  musicId?: number;
  audioUrl?: string;
  error?: string;
  startedAt: number;
}

interface StartParams {
  prompt: string;
  makeInstrumental: boolean;
}

interface AIGenerationContextValue {
  task: AIGenerationTask | null;
  isActive: boolean;
  startGeneration: (p: StartParams) => Promise<void>;
  dismiss: () => void;
  retry: () => void;
}

const ACTIVE_PHASES: UiPhase[] = ["converting", "generating", "preparing_audio"];
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;

const AIGenerationContext = createContext<AIGenerationContextValue | null>(null);

function jobToTask(job: GenerationJobResponse): AIGenerationTask {
  return {
    jobId: job.job_id,
    phase: job.phase,
    originalPrompt: job.original_prompt,
    convertedPrompt: job.converted_prompt ?? undefined,
    musicId: job.music_id ?? undefined,
    audioUrl: job.audio_url ?? undefined,
    error: job.error ?? undefined,
    startedAt: Date.now(),
  };
}

export function AIGenerationProvider({ children }: { children: ReactNode }) {
  const [task, setTask] = useState<AIGenerationTask | null>(null);
  const lastParams = useRef<StartParams | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);

  const clearTimer = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  // 단일 폴링 루프: jobId가 있고 활성 phase일 때만 동작
  const pollOnce = useCallback((jobId: number) => {
    clearTimer();
    pollTimer.current = setTimeout(async () => {
      if (attempts.current >= MAX_POLL_ATTEMPTS) {
        setTask((prev) =>
          prev ? { ...prev, phase: "failed", error: "시간이 초과되었습니다." } : prev
        );
        return;
      }
      attempts.current += 1;
      try {
        const job = await getGenerationJob(jobId);
        setTask(jobToTask(job));
        if (job.phase === "generating" || job.phase === "preparing_audio") {
          pollOnce(jobId);
        }
      } catch {
        pollOnce(jobId); // 일시적 오류는 재시도
      }
    }, POLL_INTERVAL_MS);
  }, []);

  // 마운트 시 서버에서 활성 job 복원
  useEffect(() => {
    let cancelled = false;
    if (getCurrentUserId() === null) return;
    getActiveGeneration()
      .then((job) => {
        if (cancelled || !job) return;
        setTask(jobToTask(job));
        attempts.current = 0;
        pollOnce(job.job_id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [pollOnce]);

  const startGeneration = useCallback(
    async (params: StartParams) => {
      // 단일 작업 가드
      if (task && ACTIVE_PHASES.includes(task.phase)) return;
      const trimmed = params.prompt.trim();
      const userId = getCurrentUserId();
      if (!trimmed || userId === null) return;
      lastParams.current = params;

      setTask({
        phase: "converting",
        originalPrompt: trimmed,
        startedAt: Date.now(),
      });

      try {
        // 1) 프롬프트 변환
        const conv = await convertPromptOnly({
          prompt: trimmed,
          make_instrumental: params.makeInstrumental,
        });
        let converted = conv.converted_prompt;
        try {
          const parsed = JSON.parse(conv.converted_prompt);
          converted = parsed?.prompt ?? conv.converted_prompt;
        } catch {
          /* 평문 프롬프트 */
        }
        setTask((prev) =>
          prev ? { ...prev, convertedPrompt: converted } : prev
        );

        // 2) 생성 요청 → job_id
        const res = await generateMusicAsync({
          prompt: converted,
          user_id: userId,
          make_instrumental: params.makeInstrumental,
        });

        setTask((prev) =>
          prev
            ? { ...prev, jobId: res.job_id, phase: "generating", convertedPrompt: converted }
            : prev
        );
        attempts.current = 0;
        pollOnce(res.job_id);
      } catch (e: unknown) {
        const err = e as { response?: { status?: number } };
        const msg =
          err?.response?.status === 409
            ? "이미 진행 중인 생성 작업이 있습니다."
            : "생성 요청에 실패했습니다. 다시 시도해주세요.";
        setTask((prev) => (prev ? { ...prev, phase: "failed", error: msg } : prev));
      }
    },
    [task, pollOnce]
  );

  const dismiss = useCallback(() => {
    clearTimer();
    setTask(null);
  }, []);

  const retry = useCallback(() => {
    const params = lastParams.current;
    clearTimer();
    setTask(null);
    if (params) void startGeneration(params);
  }, [startGeneration]);

  const isActive = !!task && ACTIVE_PHASES.includes(task.phase);

  return (
    <AIGenerationContext.Provider
      value={{ task, isActive, startGeneration, dismiss, retry }}
    >
      {children}
    </AIGenerationContext.Provider>
  );
}

export function useAIGeneration(): AIGenerationContextValue {
  const ctx = useContext(AIGenerationContext);
  if (!ctx) {
    throw new Error("useAIGeneration must be used within AIGenerationProvider");
  }
  return ctx;
}
