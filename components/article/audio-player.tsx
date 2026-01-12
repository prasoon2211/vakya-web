"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Pause, X, BookOpenText, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  audioUrl: string;
  onClose?: () => void;
  hasTimestamps?: boolean;
  onReadingModeClick?: () => void;
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5];

export function AudioPlayer({ audioUrl, onClose, hasTimestamps, onReadingModeClick }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, duration));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];

    audio.playbackRate = newSpeed;
    setPlaybackSpeed(newSpeed);
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-white border-t md:border border-[#e8dfd3] md:rounded-2xl backdrop-blur-xl shadow-lg">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Progress bar - top row */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <span className="text-xs text-[#6b6b6b] w-10 font-mono tabular-nums">
          {formatTime(currentTime)}
        </span>
        <div className="flex-1 relative h-1.5 bg-[#e8dfd3] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#c45c3e] to-[#d4724f] rounded-full transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <span className="text-xs text-[#6b6b6b] w-10 font-mono tabular-nums text-right">
          {formatTime(duration)}
        </span>
      </div>

      {/* Controls - bottom row */}
      <div className="flex items-center justify-between px-4 pb-3">
        {/* Left side */}
        <div className="flex items-center gap-2">
          {/* Reading Mode button */}
          {hasTimestamps && onReadingModeClick ? (
            <button
              onClick={onReadingModeClick}
              className="p-2 text-[#6b6b6b] hover:text-[#c45c3e] transition-colors"
              title="Reading Mode"
            >
              <BookOpenText className="h-5 w-5" />
            </button>
          ) : (
            <div className="w-9" /> // Spacer when no reading mode
          )}
        </div>

        {/* Center - playback controls */}
        <div className="flex items-center gap-1">
          {/* Skip back 10s */}
          <button
            onClick={() => seek(-10)}
            className="flex flex-col items-center p-1.5 text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4] rounded-lg transition-colors"
            title="Skip back 10 seconds"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight">10s</span>
          </button>

          {/* Play/Pause */}
          <Button
            onClick={togglePlay}
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg shadow-[#c45c3e]/20 mx-2"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>

          {/* Skip forward 10s */}
          <button
            onClick={() => seek(10)}
            className="flex flex-col items-center p-1.5 text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4] rounded-lg transition-colors"
            title="Skip forward 10 seconds"
          >
            <RotateCw className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight">10s</span>
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Speed control */}
          <button
            onClick={cycleSpeed}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-lg border transition-all duration-200",
              playbackSpeed !== 1
                ? "bg-[#c45c3e]/10 border-[#c45c3e]/30 text-[#c45c3e]"
                : "bg-[#f3ede4] border-[#e8dfd3] text-[#6b6b6b] hover:border-[#d4c5b5]"
            )}
          >
            {playbackSpeed}x
          </button>

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
