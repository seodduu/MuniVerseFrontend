import { useEffect, useRef, useState } from "react";
import type { CanvasAlbum } from "../../api/music";
import { resolveMediaUrl } from "../../utils/mediaUrl";

interface MusicPlayerBarProps {
    album: CanvasAlbum;
    audioUrl: string;
    onClose: () => void;
}

export default function MusicPlayerBar({ album, audioUrl }: MusicPlayerBarProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(1);

    // Auto-play when url changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                .catch(e => console.error("Playback failed", e));
        }
    }, [audioUrl]);



    const handleTimeUpdate = () => {
        if (audioRef.current) {
            const current = audioRef.current.currentTime;
            const duration = audioRef.current.duration || 1;
            setProgress((current / duration) * 100);
        }
    };

    return (
        <div className="fixed bottom-0 left-[30%] -translate-x-1/2 z-[200] flex justify-center pb-12 pointer-events-none transition-all duration-500">
            <audio
                ref={audioRef}
                src={resolveMediaUrl(audioUrl)}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
            />

            {/* Player Container - Glassmorphism (Compact & Sleek) - Light Theme */}
            <div className="bg-white/90 backdrop-blur-xl border border-black/5 rounded-full pl-2 pr-6 py-2 flex items-center gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.15)] pointer-events-auto w-[500px] max-w-[90vw] relative data-[playing=true]:shadow-[0_20px_60px_rgba(0,0,0,0.2)] transition-all duration-500">

                {/* Album Art (Rotating - Compact) */}
                <div className="relative w-12 h-12 flex-shrink-0">
                    <img
                        src={album.cover}
                        className="relative z-10 w-full h-full rounded-full object-cover border border-black/10 shadow-md"
                        style={{
                            animation: 'spin 10s linear infinite',
                            animationPlayState: isPlaying ? 'running' : 'paused'
                        }}
                        alt="cover"
                    />
                    {/* Center hole for vinyl look */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-[#f0f0f0] rounded-full border border-black/10 z-20" />
                </div>

                {/* Info (Compact Text) */}
                <div className="flex flex-col flex-1 overflow-hidden gap-0.5">
                    <span className="text-black text-base font-bold truncate">{album.title}</span>
                    <span className="text-black/60 text-xs truncate">{album.artist}</span>
                </div>

                {/* Controls (Compact Buttons) */}
                <div className="flex items-center gap-3">
                    {/* Volume Control */}
                    <div className="flex items-center gap-1.5 mr-1 group/vol">
                        <svg className="w-4 h-4 text-black/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            onChange={(e) => {
                                const newVol = parseFloat(e.target.value);
                                setVolume(newVol);
                                if (audioRef.current) audioRef.current.volume = newVol;
                            }}
                            className="w-16 h-1 bg-black/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-black"
                        />
                    </div>
                </div>

                {/* Progress Bar (Positioned) */}
                <div className="absolute bottom-0 left-16 right-8 h-0.5 bg-black/5 rounded-full overflow-hidden">
                    <div className="h-full bg-black transition-all duration-300 ease-linear" style={{ width: `${progress}%` }} />
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
