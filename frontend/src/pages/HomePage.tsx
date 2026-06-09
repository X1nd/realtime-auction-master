import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getMerchantRooms, getDevToken } from '../api'
import { useAuctionStore } from '../store/useAuctionStore'

interface RoomInfo {
  userId: number
  username: string
  nickname: string
  avatarUrl: string | null
  ongoingName: string
  totalGoods: number
  hasLive: boolean
}

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDevToken().then((res) => {
      if (res.success && res.data) {
        useAuctionStore.getState().setMyUser(res.data.userId, res.data.username || `用户${res.data.userId}`, res.data.nickname)
      }
    }).catch(() => {}).finally(() => {
      loadRooms()
    })
  }, [])

  const loadRooms = async () => {
    try {
      const res = await getMerchantRooms()
      if (res.success && res.data) {
        setRooms(res.data || [])
      }
    } catch (e) {
      console.error('加载直播间失败', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(180deg, #0a0a14 0%, #1a1a2e 50%, #16213e 100%)',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overscrollBehavior: 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 20px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>实时竞拍</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            直播竞拍，即刻出价
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/bids" style={{
            fontSize: 13, color: '#fff', textDecoration: 'none',
            padding: '6px 14px', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 20, background: 'rgba(255,255,255,0.08)',
          }}>
            我的出价
          </Link>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>
          加载中...
        </div>
      ) : rooms.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.3)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <p style={{ fontSize: 16 }}>暂无直播间</p>
          <p style={{ fontSize: 13 }}>请前往商家后台发布商品</p>
        </div>
      ) : (
        <div style={{
          padding: '0 16px',
          paddingBottom: 'max(80px, calc(40px + env(safe-area-inset-bottom)))',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
        }}>
          {rooms.map((room) => (
            <div
              key={room.userId}
              onClick={() => navigate(`/room/${room.userId}`)}
              style={{
                background: room.hasLive
                  ? 'linear-gradient(135deg, rgba(255,77,79,0.12), rgba(255,122,69,0.08))'
                  : 'rgba(255,255,255,0.04)',
                border: room.hasLive
                  ? '1px solid rgba(255,77,79,0.25)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16,
                padding: 16,
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* LIVE badge */}
              {room.hasLive && (
                <div style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#ff4d4f',
                    boxShadow: '0 0 8px rgba(255,77,79,0.6)',
                    display: 'inline-block',
                  }} />
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#ff4d4f',
                    letterSpacing: 1,
                  }}>
                    LIVE
                  </span>
                </div>
              )}

              {/* Avatar */}
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: room.hasLive
                  ? 'linear-gradient(135deg, #ff4d4f, #ff7a45)'
                  : 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 700,
                marginBottom: 10,
              }}>
                {(room.nickname || room.username).charAt(0).toUpperCase()}
              </div>

              {/* Room name */}
              <h3 style={{
                margin: '0 0 4px', fontSize: 15, fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {room.nickname || room.username}
              </h3>

              {/* Status text */}
              <p style={{
                margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {room.hasLive
                  ? `正在拍: ${room.ongoingName}`
                  : `${room.totalGoods} 件商品`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default HomePage
