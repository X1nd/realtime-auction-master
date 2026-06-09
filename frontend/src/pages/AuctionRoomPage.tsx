import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Toast } from 'antd-mobile'
import { useAuctionStore, AuctionState } from '../store/useAuctionStore'
import wsClient from '../websocket/socketClient'
import RealTimeRankList from '../components/RealTimeRankList'
import VideoPlayer from '../components/VideoPlayer'
import ChatArea from '../components/ChatArea'
import BidFirework from '../components/CrownConfetti'
import { getDevToken, getToken, getAuctionSequence } from '../api'
import { useAuctionSound } from '../hooks/useAuctionSound'
import './AuctionRoomPage.css'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'

const AuctionRoomPage: React.FC = () => {
  const { userId: userIdParam, goodsId: goodsIdParam } = useParams<{ userId?: string; goodsId?: string }>()
  const navigate = useNavigate()
  const timerRef = useRef<number | null>(null)
  const transitionTimerRef = useRef<number | null>(null)
  const [displayRemainingMs, setDisplayRemainingMs] = useState(0)
  const [showCrown, setShowCrown] = useState(false)
  const [showOutbid, setShowOutbid] = useState(false)
  const [nextAuctionName, setNextAuctionName] = useState('')
  const [nextAuctionCountdown, setNextAuctionCountdown] = useState(0)
  const [showNextToast, setShowNextToast] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [roomSequence, setRoomSequence] = useState<Array<{ id: number; name: string; sortOrder: number; startPrice: number; status: number; finalPrice?: number; winnerUserId?: number }>>([])

  const isRoomMode = !!userIdParam
  const roomUserId = userIdParam ? parseInt(userIdParam) : null

  const {
    setGoodsId,
    auctionData,
    rankList,
    result,
    isConnected,
    upcomingItems,
    orderId,
    setConnected,
    setAuctionData,
    addBidder,
    setResult,
    setMyTurn,
    setNextAuction,
    setOrderId,
    reset,
    currentGoodsId,
    setCurrentGoodsId,
  } = useAuctionStore()

  const sound = useAuctionSound()
  const finalStageRef = useRef(false)

  const currentAuctionName = upcomingItems.find(i => i.id === currentGoodsId)?.name
    || (goodsIdParam ? `竞拍 #${goodsIdParam}` : '直播间')

  // Add robot user names
  useEffect(() => {
    const store = useAuctionStore.getState()
    store.addUserName(99901, '竞价达人A')
    store.addUserName(99902, '竞价达人B')
    store.addUserName(99903, '竞价达人C')
    store.addUserName(99904, '竞价达人D')
  }, [])

  // Load room sequence in room mode
  useEffect(() => {
    if (!isRoomMode || !roomUserId) return
    getAuctionSequence(roomUserId).then(res => {
      if (res.success && res.data) {
        const seq: typeof roomSequence = []
        if (res.data.ongoing) seq.push({ ...res.data.ongoing, status: 1 })
        res.data.upcoming?.forEach((i: any) => seq.push({ ...i, status: 0 }))
        res.data.ended?.forEach((i: any) => seq.push({ ...i, status: i.status || 2 }))
        setRoomSequence(seq)
        if (res.data.ongoing) {
          setCurrentGoodsId(res.data.ongoing.id)
        }
        useAuctionStore.getState().setSequenceData(
          res.data.ongoing, res.data.upcoming || [], res.data.ended || []
        )
      }
    })
  }, [isRoomMode, roomUserId])

  // Countdown tick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    if (!auctionData || auctionData.currentState === AuctionState.ENDED ||
        auctionData.currentState === AuctionState.CANCELLED ||
        auctionData.currentState === AuctionState.NOT_STARTED) {
      return
    }

    timerRef.current = window.setInterval(() => {
      setDisplayRemainingMs(prev => {
        const newVal = Math.max(0, prev - 100)
        if (newVal <= 0 && timerRef.current) clearInterval(timerRef.current)
        return newVal
      })
    }, 100)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [auctionData?.currentState, auctionData?.remainingMs])

  // Main effect: connect & listen
  useEffect(() => {
    if (goodsIdParam) setGoodsId(parseInt(goodsIdParam))

    const joinRoom = () => {
      if (isRoomMode && roomUserId) {
        if (wsClient.isConnected()) {
          wsClient.send('join-merchant-room', roomUserId)
        }
      } else if (goodsIdParam && wsClient.isConnected()) {
        wsClient.send('join-auction-room', parseInt(goodsIdParam))
      }
    }

    const tryConnect = (token: string) => {
      if (wsClient.isConnected()) {
        setConnected(true)
        joinRoom()
        return
      }
      if (wsClient.getReadyState() === WebSocket.CONNECTING) return
      wsClient.connect(WS_URL, token)
    }

    getDevToken().then((res) => {
      if (res.success && res.data) {
        if (res.data.accessToken) tryConnect(res.data.accessToken)
        if (res.data.userId) {
          useAuctionStore.getState().setMyUser(res.data.userId, res.data.username || `用户${res.data.userId}`, res.data.nickname)
          sound.setMyUserId(res.data.userId)
        }
      } else {
        const cached = getToken()
        if (cached) tryConnect(cached)
      }
    }).catch(() => {
      const cached = getToken()
      if (cached) tryConnect(cached)
    })

    wsClient.on('connected', () => {
      setConnected(true)
      joinRoom()
    })

    wsClient.on('disconnected', () => setConnected(false))

    wsClient.on('joined-room', (data: any) => {
      if (data.currentGoodsId) {
        setCurrentGoodsId(data.currentGoodsId)
      }
    })

    wsClient.on('auction-state', (data: any) => {
      setAuctionData({
        currentState: data.currentState as AuctionState,
        currentPrice: data.currentPrice ?? 0,
        remainingMs: data.remainingMs ?? 0,
        participantCount: data.participantCount ?? 0,
        latestBidderId: data.latestBidderId ?? null,
        maxPrice: data.maxPrice ?? null,
        incrementPrice: data.incrementPrice ?? 10,
        autoDelaySeconds: data.autoDelaySeconds ?? 15,
        delayCount: data.delayCount ?? 0,
        maxDelayCount: data.maxDelayCount ?? 3,
      })
      setDisplayRemainingMs(data.remainingMs ?? 0)
    })

    const applyStateData = (data: any) => {
      setAuctionData({
        currentState: data.currentState as AuctionState,
        currentPrice: data.currentPrice ?? 0,
        remainingMs: data.remainingMs ?? 0,
        participantCount: data.participantCount ?? 0,
        latestBidderId: data.latestBidderId ?? null,
        maxPrice: data.maxPrice ?? null,
        incrementPrice: data.incrementPrice ?? 10,
        autoDelaySeconds: data.autoDelaySeconds ?? 15,
        delayCount: data.delayCount ?? 0,
        maxDelayCount: data.maxDelayCount ?? 3,
      })
      setDisplayRemainingMs(data.remainingMs ?? 0)
    }

    wsClient.on('price-updated', (data: any) => {
      applyStateData(data)
      const myUserId = useAuctionStore.getState().myUserId
      const isMine = data.latestBidderId === myUserId
      setMyTurn(isMine)
      if (isMine) setShowCrown(true)

      sound.onPriceUpdated(data.latestBidderId ?? null)

      if (data.latestBidderId && data.currentPrice) {
        const store = useAuctionStore.getState()
        const username = store.userNames[data.latestBidderId] || `用户${data.latestBidderId}`
        addBidder({
          userId: data.latestBidderId,
          username,
          bidPrice: data.currentPrice,
          bidTime: Date.now(),
        })
      }
    })

    wsClient.on('outbid', (data: any) => {
      setMyTurn(false)
      setShowOutbid(true)
      setTimeout(() => setShowOutbid(false), 2500)
      Toast.show({ content: `被超越！当前价格 ¥${data.currentPrice?.toFixed(0)}`, icon: 'fail' })
    })

    wsClient.on('timer-sync', (data: any) => {
      setDisplayRemainingMs(data.remainingMs ?? 0)
      if (data.currentState) {
        useAuctionStore.getState().setAuctionData({
          ...useAuctionStore.getState().auctionData!,
          currentState: data.currentState as AuctionState,
          remainingMs: data.remainingMs ?? 0,
          currentPrice: data.currentPrice ?? useAuctionStore.getState().auctionData?.currentPrice ?? 0,
        })
      }
    })

    wsClient.on('auction-ended', (data: any) => {
      applyStateData(data)
      sound.playAuctionEnd()
      setResult({
        winnerUserId: data.winnerUserId ?? null,
        finalPrice: data.finalPrice ?? data.currentPrice ?? null,
      })
      setOrderId(data.orderId ?? null)
      // Update room sequence with ended item
      if (isRoomMode) {
        setRoomSequence(prev => prev.map(item =>
          item.id === currentGoodsId
            ? { ...item, status: 2, finalPrice: data.finalPrice, winnerUserId: data.winnerUserId }
            : item
        ))
      }
    })

    wsClient.on('next-auction', (data: any) => {
      setNextAuction(data.nextGoodsId, data.startsInMs)
      setNextAuctionName(data.nextGoodsName || `竞拍 #${data.nextGoodsId}`)
      setNextAuctionCountdown(Math.floor(data.startsInMs / 1000))
      setShowNextToast(true)

      if (transitionTimerRef.current) clearInterval(transitionTimerRef.current)
      transitionTimerRef.current = window.setInterval(() => {
        setNextAuctionCountdown(prev => {
          if (prev <= 1) {
            if (transitionTimerRef.current) clearInterval(transitionTimerRef.current)
            setShowNextToast(false)
            // In room mode, stay in same room — update currentGoodsId
            if (isRoomMode) {
              setCurrentGoodsId(data.nextGoodsId)
              setRoomSequence(prev => prev.map(item =>
                item.id === data.nextGoodsId ? { ...item, status: 1 } : item
              ))
              // Clear rank list for new item
              useAuctionStore.getState().setRankList([])
            } else {
              navigate(`/auction/${data.nextGoodsId}`)
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    })

    wsClient.on('auction-started', (data: any) => {
      if (isRoomMode && data.goodsId) {
        setCurrentGoodsId(data.goodsId)
        setRoomSequence(prev => prev.map(item =>
          item.id === data.goodsId ? { ...item, status: 1 } : item
        ))
      } else if (!isRoomMode && data.goodsId) {
        Toast.show({ content: `下一件竞拍已开始: ${data.name || ''}` })
      }
    })

    wsClient.on('bid-error', (data: any) => {
      Toast.show({ content: data.message || '出价失败', icon: 'fail' })
    })

    wsClient.on('price-sync', (data: any) => {
      setAuctionData({
        currentState: data.currentState as AuctionState,
        currentPrice: data.currentPrice ?? 0,
        remainingMs: data.remainingMs ?? 0,
        participantCount: data.participantCount ?? 0,
        latestBidderId: data.latestBidderId ?? null,
        maxPrice: data.maxPrice ?? null,
        incrementPrice: data.incrementPrice ?? 10,
        autoDelaySeconds: data.autoDelaySeconds ?? 15,
        delayCount: data.delayCount ?? 0,
        maxDelayCount: data.maxDelayCount ?? 3,
      })
    })

    return () => {
      ;['connected','disconnected','joined-room','auction-state','price-updated','outbid',
        'timer-sync','auction-ended','next-auction','auction-started','bid-error','price-sync'
      ].forEach(e => wsClient.off(e))
      if (isRoomMode && roomUserId) {
        wsClient.send('leave-merchant-room', roomUserId)
      }
      wsClient.disconnect()
      reset()
      if (timerRef.current) clearInterval(timerRef.current)
      if (transitionTimerRef.current) clearInterval(transitionTimerRef.current)
    }
  }, [goodsIdParam, isRoomMode, roomUserId, setGoodsId, setConnected, setAuctionData, addBidder, setResult, setMyTurn, reset, setNextAuction, navigate, setCurrentGoodsId])

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const hundreds = Math.floor((ms % 1000) / 100)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundreds}`
  }

  const handleBid = () => {
    if (isMyTurn) return
    if (!auctionData) return
    if (auctionData.currentState !== AuctionState.ONGOING && auctionData.currentState !== AuctionState.DELAYING) {
      Toast.show({ content: '竞拍未开始或已结束', icon: 'fail' })
      return
    }
    const bidGoodsId = isRoomMode ? currentGoodsId : (goodsIdParam ? parseInt(goodsIdParam) : null)
    if (!bidGoodsId) return
    wsClient.send('bid', bidGoodsId)
  }

  const currentPriceFormatted = auctionData?.currentPrice.toFixed(0) ?? '0'
  const isEnded = auctionData?.currentState === AuctionState.ENDED
  const isCancelled = auctionData?.currentState === AuctionState.CANCELLED
  const isNotStarted = auctionData?.currentState === AuctionState.NOT_STARTED
  const isDelaying = auctionData?.currentState === AuctionState.DELAYING
  const isOngoing = auctionData?.currentState === AuctionState.ONGOING
  const countdownColor = displayRemainingMs <= 10000 ? '#ff4d4f' : isDelaying ? '#ff9800' : '#faad14'
  const canBid = isOngoing || isDelaying

  // Final stage sound when countdown <= 10s
  useEffect(() => {
    if (!canBid || displayRemainingMs <= 0) {
      sound.stopFinalStage()
      finalStageRef.current = false
      return
    }
    if (displayRemainingMs <= 10000 && !finalStageRef.current) {
      finalStageRef.current = true
      sound.startFinalStage()
    }
    if (displayRemainingMs > 10000 && finalStageRef.current) {
      sound.stopFinalStage()
      finalStageRef.current = false
    }
  }, [displayRemainingMs, canBid, sound])

  const userNames = useAuctionStore(s => s.userNames)
  const myUserId = useAuctionStore(s => s.myUserId)
  const isMyTurn = useAuctionStore(s => s.isMyTurn)

  const seqStatusLabel: Record<number, string> = { 0: '等待中', 1: '进行中', 2: '已结束', 3: '已取消' }

  return (
    <div className="auction-live-room">
      {/* Main split layout */}
      <div className="live-room-body">
        {/* Left: Video */}
        <div className="live-video-panel">
          <VideoPlayer />
        </div>

        {/* Right: Chat + Button */}
        <div className="live-chat-panel">
          <ChatArea
            messages={rankList}
            currentPrice={auctionData?.currentPrice ?? 0}
            userNames={userNames}
          />

          {/* Circular action button */}
          <div className="chat-action-bar">
            <motion.button
              className="circular-bid-btn"
              onClick={() => setPopupOpen(true)}
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
            >
              <span className="circular-btn-icon">💰</span>
              <span className="circular-btn-label">
                {canBid ? '出价' : isNotStarted ? '详情' : isEnded ? '结果' : '查看'}
              </span>
            </motion.button>
          </div>

          {/* Product popup INSIDE chat panel (same width) */}
          <AnimatePresence>
            {popupOpen && (
              <motion.div
                className="product-popup-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPopupOpen(false)}
              >
                <motion.div
                  className="product-popup-card"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 200 }}
                  dragElastic={{ top: 0, bottom: 0.5 }}
                  dragMomentum={false}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 100 || info.velocity.y > 500) {
                      setPopupOpen(false)
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Drag handle */}
                  <div className="popup-handle">
                    <div className="popup-handle-bar" />
                  </div>

                  {/* Status banners */}
                  {isNotStarted && (
                    <div className="auction-banner banner-waiting">竞拍即将开始，请耐心等待...</div>
                  )}
                  {isEnded && (
                    <div className="auction-banner banner-ended">竞拍已结束</div>
                  )}
                  {isCancelled && (
                    <div className="auction-banner banner-cancelled">竞拍已取消</div>
                  )}

                  {/* Countdown */}
                  <div className="popup-countdown" style={{ color: countdownColor }}>
                    {isNotStarted ? (
                      <span className="countdown-waiting">--:--.--</span>
                    ) : (
                      <span className="countdown-value">{formatCountdown(displayRemainingMs)}</span>
                    )}
                  </div>

                  {isDelaying && (
                    <motion.div className="delay-indicator" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      {auctionData?.delayCount >= 3 ? '延时已达上限' : '即将结束，延时中...'}
                    </motion.div>
                  )}

                  {/* Price */}
                  <div className="popup-price-section">
                    <p className="popup-price-label">当前价格</p>
                    <div className="popup-price-display">
                      <span className="price-symbol">¥</span>
                      <span className="price-number">{currentPriceFormatted}</span>
                    </div>
                  </div>

                  {/* Info row */}
                  <div className="popup-info-row">
                    <div className="popup-info-item">
                      <span className="popup-info-label">加价幅度</span>
                      <span className="popup-info-value">¥{auctionData?.incrementPrice.toFixed(0) ?? '10'}</span>
                    </div>
                    <div className="popup-info-item">
                      <span className="popup-info-label">参与人数</span>
                      <span className="popup-info-value">{auctionData?.participantCount ?? 0}</span>
                    </div>
                  </div>

                  {/* Bid button */}
                  {auctionData && !isEnded && !isCancelled && !isNotStarted && (
                    <div className="popup-bid-wrapper">
                      <div style={{ position: 'relative' }}>
                        {isMyTurn && (
                          <motion.div
                            className="leading-glow"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.98, 1.03, 0.98] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            style={{
                              position: 'absolute',
                              inset: -4,
                              borderRadius: 28,
                              background: 'linear-gradient(135deg, #FFD700, #FFA000)',
                              filter: 'blur(8px)',
                              zIndex: 0,
                            }}
                          />
                        )}
                        <Button
                          block
                          size="large"
                          color={isMyTurn ? 'warning' : 'primary'}
                          className={`bid-button ${isMyTurn ? 'bid-button-leading' : ''}`}
                          onClick={handleBid}
                          disabled={!isConnected || !canBid}
                          style={{ position: 'relative', zIndex: 1 }}
                        >
                          {isMyTurn ? '👑领先中' : `立即出价 + ¥${auctionData?.incrementPrice.toFixed(0) ?? '10'}`}
                        </Button>
                        {showOutbid && (
                          <motion.div
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 0 }}
                            transition={{ duration: 0.8 }}
                            style={{
                              position: 'absolute', inset: -2, borderRadius: 26,
                              border: '3px solid #ff4d4f', zIndex: 2, pointerEvents: 'none',
                            }}
                          />
                        )}
                        <BidFirework active={showCrown} onComplete={() => setShowCrown(false)} />
                      </div>
                    </div>
                  )}

                  {isNotStarted && (
                    <div className="popup-bid-wrapper">
                      <Button block size="large" color="primary" className="bid-button" disabled>
                        等待竞拍开始...
                      </Button>
                    </div>
                  )}

                  {/* Result */}
                  <AnimatePresence>
                    {isEnded && result && (
                      <motion.div className="result-display" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <h3 className="result-title">竞拍结果</h3>
                        {result.winnerUserId ? (
                          <>
                            <p className="result-winner">中标用户：{userNames[result.winnerUserId] || `用户${result.winnerUserId}`}</p>
                            <p className="result-price">成交价：¥{result.finalPrice?.toFixed(0)}</p>
                            {result.winnerUserId === myUserId && orderId && (
                              <div style={{ marginTop: 12 }}>
                                <Button
                                  block size="small" color="primary"
                                  onClick={() => navigate(`/payment/${orderId}`)}
                                  style={{ borderRadius: 8, fontWeight: 600, fontSize: 14 }}
                                >
                                  去支付 ¥{result.finalPrice?.toFixed(0)}
                                </Button>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="result-empty">无人出价，流拍</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Rank list */}
                  {rankList.length > 0 && <RealTimeRankList rankList={rankList} />}

                  {/* Room sequence list — all items in this room */}
                  {isRoomMode && roomSequence.length > 0 && (
                    <div className="room-sequence-section">
                      <div className="room-sequence-title">本场商品 ({roomSequence.length})</div>
                      {roomSequence.map((item) => {
                        const isCurrent = item.id === currentGoodsId && (isOngoing || isDelaying)
                        const isItemEnded = item.status === 2 || item.status === 3
                        const userWon = item.winnerUserId === myUserId
                        return (
                          <div
                            key={item.id}
                            className={`room-sequence-item ${isCurrent ? 'seq-item-current' : ''} ${isItemEnded ? 'seq-item-ended' : ''}`}
                          >
                            <div className="seq-item-left">
                              <span className="seq-item-name">{item.name}</span>
                              {isCurrent && <span className="seq-item-live">LIVE</span>}
                              {isItemEnded && item.finalPrice != null && (
                                <span className="seq-item-final">
                                  成交 ¥{item.finalPrice.toFixed(0)}
                                </span>
                              )}
                              {isItemEnded && userWon && (
                                <span className="seq-item-won">你已中标</span>
                              )}
                            </div>
                            <div className="seq-item-right">
                              <span className={`seq-status seq-status-${item.status}`}>
                                {seqStatusLabel[item.status]}
                              </span>
                              {!isItemEnded && (
                                <span className="seq-item-price">
                                  ¥{item.startPrice.toFixed(0)}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Top bar */}
      <div className="live-top-bar">
        <button className="back-btn" onClick={() => navigate('/')}>←</button>
        <div className="top-bar-center">
          <span className="top-bar-title">{currentAuctionName}</span>
          {isOngoing && <span className="top-bar-live">● LIVE</span>}
        </div>
        <div className={`connection-dot ${isConnected ? 'connected' : 'disconnected'}`} />
      </div>

      {/* Price overlay on video */}
      <div className="video-price-overlay">
        <span className="video-price-label">当前价</span>
        <span className="video-price-value">¥{currentPriceFormatted}</span>
        {canBid && displayRemainingMs > 0 && (
          <span className="video-countdown" style={{ color: countdownColor }}>
            {formatCountdown(displayRemainingMs)}
          </span>
        )}
      </div>

      {/* Outbid overlay */}
      <AnimatePresence>
        {showOutbid && (
          <motion.div
            className="outbid-overlay"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 1, 1, 0], scale: [0.5, 1.1, 1, 1.05, 0.9] }}
            transition={{ duration: 2, times: [0, 0.15, 0.3, 0.7, 1] }}
          >
            <span style={{ fontSize: 64 }}>⚡</span>
            <span className="outbid-text">被超越！</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Next auction transition */}
      <AnimatePresence>
        {showNextToast && (
          <motion.div
            className="next-auction-toast"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <div className="next-auction-label">下一件竞拍即将开始</div>
            <div className="next-auction-name">{nextAuctionName}</div>
            <div className="next-auction-countdown">{nextAuctionCountdown}s</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AuctionRoomPage
