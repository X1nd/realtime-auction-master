import React, { useRef, useEffect, useState } from 'react'
import Hls from 'hls.js'
import './VideoPlayer.css'

const VIDEO_URL = import.meta.env.VITE_VIDEO_URL || ''

const VideoPlayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasVideo, setHasVideo] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!VIDEO_URL) return
    const el = videoRef.current
    if (!el) return

    let hls: Hls | null = null

    const onCanPlay = () => setHasVideo(true)
    const onError = () => setError(true)
    el.addEventListener('canplay', onCanPlay)
    el.addEventListener('error', onError)

    if (VIDEO_URL.endsWith('.m3u8') && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: false,
        liveSyncDurationCount: 3,
      } as any)

      hls.on(Hls.Events.ERROR, (_event: unknown, data: any) => {
        if (data?.fatal) {
          setError(true)
          if (hls) hls.destroy()
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        el.play().catch(() => {})
      })

      hls.attachMedia(el)
      hls.loadSource(VIDEO_URL)
    } else {
      el.src = VIDEO_URL
      el.play().catch(() => {})
    }

    return () => {
      el.removeEventListener('canplay', onCanPlay)
      el.removeEventListener('error', onError)
      if (hls) hls.destroy()
    }
  }, [])

  if (!VIDEO_URL || error) {
    return (
      <div className="video-container">
        <div className="video-placeholder">
          <div className="placeholder-icon">📹</div>
          <p className="placeholder-text">直播画面</p>
          <div className="live-badge">LIVE</div>
        </div>
      </div>
    )
  }

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        className="video-element"
        loop
        muted
        autoPlay
        playsInline
        style={{ opacity: hasVideo ? 1 : 0 }}
      />
      {!hasVideo && (
        <div className="video-loading">
          <p>加载直播流...</p>
        </div>
      )}
      <div className="live-badge">LIVE</div>
    </div>
  )
}

export default VideoPlayer
