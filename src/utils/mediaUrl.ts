// 백엔드가 audio_url 등 미디어 URL을 루트 상대경로("/api/v1/{id}/audio/")로 내려줄 때가 있는데,
// 프론트(Vite)는 API와 다른 origin에서 서빙되므로 <audio>.src 등에 그대로 넣으면
// 프론트 origin 기준으로 해석되어 Vite SPA fallback(index.html)이 응답으로 잡히고 재생이 실패한다.
// axios의 baseURL은 axios 요청에만 적용되므로, <audio src>처럼 axios를 거치지 않는 곳에서는
// 이 함수로 API origin을 직접 붙여 절대 URL로 변환해야 한다.
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  if (url.startsWith("/")) {
    let apiOrigin = window.location.origin;
    try {
      const base = import.meta.env.VITE_API_BASE_URL;
      if (base) {
        apiOrigin = new URL(base).origin;
      }
    } catch {
      apiOrigin = window.location.origin;
    }
    return `${apiOrigin}${url}`;
  }

  return url;
}
