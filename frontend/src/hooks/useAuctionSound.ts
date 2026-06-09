import { useCallback, useRef, useEffect } from 'react'
import { Howl } from 'howler'

const sounds = {
  bidOwn: new Howl({ src: ['/sounds/bid_own.wav'], volume: 0.6 }),
  bidOther: new Howl({ src: ['/sounds/bid_other.wav'], volume: 0.4 }),
  outbid: new Howl({ src: ['/sounds/outbid.wav'], volume: 0.5 }),
  finalStage: new Howl({ src: ['/sounds/final_stage.wav'], volume: 0.5 }),
  auctionEnd: new Howl({ src: ['/sounds/bid_own.wav'], volume: 0.7 }),
}

export function useAuctionSound() {
  const prevLatestBidderRef = useRef<number | null>(null)
  const myUserIdRef = useRef<number>(0)
  const finalStageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const setMyUserId = useCallback((uid: number) => {
    myUserIdRef.current = uid
  }, [])

  // Call on each price-updated
  const onPriceUpdated = useCallback((latestBidderId: number | null) => {
    const prev = prevLatestBidderRef.current
    const myId = myUserIdRef.current
    prevLatestBidderRef.current = latestBidderId ?? null

    if (latestBidderId == null) return

    if (latestBidderId === myId) {
      sounds.bidOwn.play()
    } else if (prev === myId && latestBidderId !== myId) {
      sounds.outbid.play()
    } else {
      sounds.bidOther.play()
    }
  }, [])

  const playAuctionEnd = useCallback(() => {
    sounds.auctionEnd.play()
  }, [])

  // Final stage: play every 2s when countdown <= 10s
  const startFinalStage = useCallback(() => {
    if (finalStageTimerRef.current) return
    sounds.finalStage.play()
    finalStageTimerRef.current = setInterval(() => {
      sounds.finalStage.play()
    }, 2000)
  }, [])

  const stopFinalStage = useCallback(() => {
    if (finalStageTimerRef.current) {
      clearInterval(finalStageTimerRef.current)
      finalStageTimerRef.current = null
    }
  }, [])

  // Cleanup
  useEffect(() => {
    return () => {
      if (finalStageTimerRef.current) clearInterval(finalStageTimerRef.current)
    }
  }, [])

  return { setMyUserId, onPriceUpdated, playAuctionEnd, startFinalStage, stopFinalStage }
}
