import { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

// ✅ 모든 레이아웃을 lazy loading으로 변경 - 초기 번들 크기 감소
const MainLayout = lazy(() => import("./components/layout/MainLayout"));
const MainLayout2 = lazy(() => import("./components/layout/MainLayout2"));
const PlainLayout = lazy(() => import("./components/layout/PlainLayout"));
const Nolayout = lazy(() => import("./components/layout/Nolayout"));

// Lazy load all pages for better performance
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const SignUpPage = lazy(() => import("./pages/auth/SignupPage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
import RequireAuth from "./pages/auth/RequireAuth";

// Home & Main Pages
const HomePage = lazy(() => import("./pages/home/HomePage"));
const ChartPage = lazy(() => import("./pages/chart/ChartPage"));
const MyPage = lazy(() => import("./pages/profile/MyPage"));

// AI Pages
const AiCreatePage = lazy(() => import("./pages/ai/AICreatePage"));
const AiSongPage = lazy(() => import("./pages/ai/AISongPage"));

// Playlist Pages
const PlaylistPage = lazy(() => import("./pages/album/PlaylistPage"));
const MyPlaylistPage = lazy(() => import("./pages/profile/MyPlaylistPage"));
const MyPlaylistPersonal = lazy(() => import("./pages/profile/MyPlaylistPersonal"));
const MyPlaylistLiked = lazy(() => import("./pages/profile/MyPlaylistLiked"));
const PlaylistEdit = lazy(() => import("./pages/album/PlaylistEdit"));
const MyAITracks = lazy(() => import("./pages/profile/MyAITracks"));

// Artist Pages
const ArtistPage = lazy(() => import("./pages/artist/ArtistPage"));
const ArtistTracksPage = lazy(() => import("./pages/artist/ArtistTracksPage"));
const ArtistAlbumsPage = lazy(() => import("./pages/artist/ArtistAlbumsPage"));
const AlbumPage = lazy(() => import("./pages/album/AlbumPage"));
const StationPage = lazy(() => import("./pages/station/StationPage"));

// Search Pages
const SearchPage = lazy(() => import("./pages/search/SearchPage"));
const SearchAll = lazy(() => import("./pages/search/SearchAll"));
const SearchArtist = lazy(() => import("./pages/search/SearchArtist"));
const SearchAlbum = lazy(() => import("./pages/search/SearchAlbum"));
const SearchSong = lazy(() => import("./pages/search/SearchSong"));

// Chart Pages
const ChartTop100 = lazy(() => import("./pages/chart/ChartTop100"));
const ChartDaily = lazy(() => import("./pages/chart/ChartDaily"));
const ChartAI = lazy(() => import("./pages/chart/ChartAI"));

// Song Pages
const NowPlayingPage = lazy(() => import("./pages/song/NowPlayingPage"));

// Experimental Pages
const InteractiveCanvasPage = lazy(() => import("./pages/experimental/InteractiveCanvasPage"));

import { PlayerProvider } from "./player/PlayerContext";
import { ToastProvider } from "./components/common/ToastProvider";
import { PlaylistProvider } from "./contexts/PlaylistContext";
import { AIGenerationProvider } from "./contexts/AIGenerationContext";
import AIGenerationToast from "./components/common/AIGenerationToast";

function AuthFallback() {
  return (
    <div className="min-h-[100dvh] w-full grid place-items-center bg-[#2d2d2d]">
      <div className="text-sm text-white/60">Loading...</div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="min-h-[50vh] w-full grid place-items-center">
      <div className="text-sm text-white/60">Loading...</div>
    </div>
  );
}

// 검색 페이지 쿼리 파라미터 유지하면서 리다이렉트
function SearchRedirect() {
  const location = useLocation();
  const search = location.search || "";
  return <Navigate to={`all${search}`} replace />;
}

import { EasterEggProvider } from "./contexts/EasterEggContext";

export default function App() {
  return (
    <PlayerProvider>
      <ToastProvider>
        <PlaylistProvider>
          <EasterEggProvider>
            <AIGenerationProvider>
              <Routes>
              {/* ✅ Experimental Canvas Route (No Layout) */}
              <Route path="/canvas" element={<Suspense fallback={<PageLoader />}><InteractiveCanvasPage /></Suspense>} />

              {/* ✅ 사이드바가 필요한 모든 페이지 */}
              <Route element={<Suspense fallback={<PageLoader />}><MainLayout /></Suspense>}>
                <Route path="/home" element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
                <Route path="/chart" element={<Suspense fallback={<PageLoader />}><ChartPage /></Suspense>}>
                  <Route index element={<Navigate to="top100" replace />} />
                  <Route path="top100" element={<Suspense fallback={<PageLoader />}><ChartTop100 /></Suspense>} />
                  <Route path="daily" element={<Suspense fallback={<PageLoader />}><ChartDaily /></Suspense>} />
                  <Route path="ai" element={<Suspense fallback={<PageLoader />}><ChartAI /></Suspense>} />
                </Route>
                <Route path="/mypage" element={<RequireAuth><Suspense fallback={<PageLoader />}><MyPage /></Suspense></RequireAuth>} />
                <Route path="/my-playlists" element={<RequireAuth><Suspense fallback={<PageLoader />}><MyPlaylistPage /></Suspense></RequireAuth>}>
                  <Route path="personal" element={<Suspense fallback={<PageLoader />}><MyPlaylistPersonal /></Suspense>} />
                  <Route path="liked" element={<Suspense fallback={<PageLoader />}><MyPlaylistLiked /></Suspense>} />
                </Route>
                <Route path="/ai/create" element={<RequireAuth><Suspense fallback={<PageLoader />}><AiCreatePage /></Suspense></RequireAuth>} />
                <Route path="/ai" element={<Navigate to="/ai/create" replace />} />
                <Route path="/aisong/:id" element={<RequireAuth><Suspense fallback={<PageLoader />}><AiSongPage /></Suspense></RequireAuth>} />
                <Route path="/my/ai-songs" element={<RequireAuth><Suspense fallback={<PageLoader />}><MyAITracks /></Suspense></RequireAuth>} />
                <Route path="/search" element={<Suspense fallback={<PageLoader />}><SearchPage /></Suspense>}>
                  <Route index element={<SearchRedirect />} />
                  <Route path="all" element={<Suspense fallback={<PageLoader />}><SearchAll /></Suspense>} />
                  <Route path="artist" element={<Suspense fallback={<PageLoader />}><SearchArtist /></Suspense>} />
                  <Route path="album" element={<Suspense fallback={<PageLoader />}><SearchAlbum /></Suspense>} />
                  <Route path="song" element={<Suspense fallback={<PageLoader />}><SearchSong /></Suspense>} />
                </Route>
              </Route>

              {/* ✅ 메인 레이아웃에 패딩이 없는 버전 */}
              <Route element={<Suspense fallback={<PageLoader />}><MainLayout2 /></Suspense>}>
                <Route path="/artists/:artistId" element={<Suspense fallback={<PageLoader />}><ArtistPage /></Suspense>} />
                <Route path="/artists/:artistId/tracks" element={<Suspense fallback={<PageLoader />}><ArtistTracksPage /></Suspense>} />
                <Route path="/artists/:artistId/albums" element={<Suspense fallback={<PageLoader />}><ArtistAlbumsPage /></Suspense>} />
                <Route path="/album/:albumId" element={<Suspense fallback={<PageLoader />}><AlbumPage /></Suspense>} />
                <Route path="/playlist/:playlistId" element={<Suspense fallback={<PageLoader />}><PlaylistPage /></Suspense>} />
                <Route path="/playlist/:playlistId/edit" element={<Suspense fallback={<PageLoader />}><PlaylistEdit /></Suspense>} />
                {/* DJ Station Pages */}
                <Route path="/station/:category" element={<Suspense fallback={<PageLoader />}><StationPage /></Suspense>} />
              </Route>

              {/* ✅ 사이드바 없는 구간 (곡 상세보기 용도) */}
              <Route element={<Suspense fallback={<PageLoader />}><PlainLayout /></Suspense>}>
                <Route path="/now-playing" element={<Suspense fallback={<PageLoader />}><NowPlayingPage /></Suspense>} />
              </Route>

              {/* ✅ 사이드바, 헤더, 플레이바 없는 구간 (로그인/회원가입 용도) */}
              {/* Nolayout은 lazy loading되어 Spline 번들이 분리됨 */}
              <Route element={<Suspense fallback={<AuthFallback />}><Nolayout /></Suspense>}>
                <Route
                  index
                  element={
                    <Suspense fallback={<AuthFallback />}>
                      <OnboardingPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/login"
                  element={
                    <Suspense fallback={<AuthFallback />}>
                      <LoginPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/signup"
                  element={
                    <Suspense fallback={<AuthFallback />}>
                      <SignUpPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/onboarding"
                  element={
                    <Suspense fallback={<AuthFallback />}>
                      <OnboardingPage />
                    </Suspense>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
              <AIGenerationToast />
            </AIGenerationProvider>
          </EasterEggProvider>
        </PlaylistProvider>
      </ToastProvider>
    </PlayerProvider>
  );
}
