import { useCallback, useRef } from 'react'

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

export function useAuctionSound() {
  const prevLatestBidderRef = useRef<number | null>(null)
  const myUserIdRef = useRef<number>(0)

  const setMyUserId = useCallback((uid: number) => {
    myUserIdRef.current = uid
  }, [])

  // Short beep when any bid happens
  const playBidTick = useCallback(() => {
    playTone(800, 0.08, 'square', 0.06)
  }, [])

  // Ascending tone when user's bid succeeds
  const playMyBidSuccess = useCallback(() => {
    playTone(600, 0.12, 'sine', 0.12)
    setTimeout(() => playTone(900, 0.1, 'sine', 0.1), 60)
  }, [])

  // Descending tone when outbid
  const playOutbid = useCallback(() => {
    playTone(500, 0.15, 'sawtooth', 0.08)
    setTimeout(() => playTone(350, 0.2, 'sawtooth', 0.08), 80)
  }, [])

  // Auction end chime
  const playAuctionEnd = useCallback(() => {
    playTone(523, 0.2, 'sine', 0.12)
    setTimeout(() => playTone(659, 0.2, 'sine', 0.12), 150)
    setTimeout(() => playTone(784, 0.3, 'sine', 0.12), 300)
  }, [])

  // Call on each price-updated: detects lead change and plays appropriate sound
  const onPriceUpdated = useCallback((latestBidderId: number | null) => {
    const prev = prevLatestBidderRef.current
    const myId = myUserIdRef.current
    prevLatestBidderRef.current = latestBidderId ?? null

    if (latestBidderId == null) return

    if (latestBidderId === myId) {
      playMyBidSuccess()
    } else if (prev === myId && latestBidderId !== myId) {
      // User just got outbid
      playOutbid()
    } else {
      playBidTick()
    }
  }, [playBidTick, playMyBidSuccess, playOutbid])

  return { setMyUserId, onPriceUpdated, playAuctionEnd }
}
