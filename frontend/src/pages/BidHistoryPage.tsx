import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from 'antd-mobile'
import { listMyBids } from '../api'

interface BidRecord {
  id: number
  auctionGoodsId: number
  userId: number
  bidPrice: number
  bidTime: string
  bidSeq: number
}

const bg = 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'

const BidHistoryPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filterGoodsId = searchParams.get('goodsId')
  const [bids, setBids] = useState<BidRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const pageSize = 20

  const loadBids = async (pageNum: number, append = false) => {
    setLoading(true)
    try {
      const res = await listMyBids({
        page: pageNum,
        pageSize,
        ...(filterGoodsId ? { goodsId: parseInt(filterGoodsId) } : {}),
      })
      if (res.success && res.data) {
        if (append) {
          setBids(prev => [...prev, ...res.data.list])
        } else {
          setBids(res.data.list)
        }
        setTotal(res.data.total)
        setPage(pageNum)
      }
    } catch (e) {
      console.error('加载出价记录失败', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBids(1)
  }, [filterGoodsId])

  const hasMore = bids.length < total

  return (
    <div style={{ minHeight: '100dvh', background: bg, color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0,
        }}>
          ← 返回
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>我的出价记录</h1>
      </div>

      {filterGoodsId && (
        <div style={{ padding: '0 20px 12px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          筛选商品 #{filterGoodsId} · 共 {total} 条
        </div>
      )}

      <div style={{ padding: '0 20px', paddingBottom: 'max(80px, calc(40px + env(safe-area-inset-bottom)))' }}>
        {bids.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <p style={{ fontSize: 16 }}>暂无出价记录</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bids.map((bid) => (
              <div
                key={bid.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(250,173,20,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#faad14',
                  flexShrink: 0,
                }}>
                  #{bid.bidSeq}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    商品 #{bid.auctionGoodsId}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {new Date(bid.bidTime).toLocaleString()}
                  </div>
                </div>
                <span style={{
                  fontSize: 16, fontWeight: 700, color: '#faad14', flexShrink: 0,
                }}>
                  ¥{bid.bidPrice.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button
              loading={loading}
              onClick={() => loadBids(page + 1, true)}
              style={{
                borderRadius: 20, border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13,
              }}
            >
              {loading ? '加载中...' : `加载更多 (${total - bids.length} 条剩余)`}
            </Button>
          </div>
        )}

        {!hasMore && bids.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            已显示全部记录
          </div>
        )}
      </div>
    </div>
  )
}

export default BidHistoryPage
