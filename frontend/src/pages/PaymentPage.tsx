import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Toast } from 'antd-mobile'
import { getOrder, payOrder } from '../api'

interface OrderData {
  id: number
  orderNo: string
  auctionGoodsId: number
  userId: number
  totalAmount: number
  status: number
  payTime?: string
  createdAt: string
}

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: '待支付', color: '#faad14' },
  1: { label: '已支付', color: '#52c41a' },
  2: { label: '已取消', color: '#8c8c8c' },
}

const bg = 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'

const PaymentPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (orderId) {
      getOrder(parseInt(orderId)).then(res => {
        if (res.success) setOrder(res.data)
      }).catch(() => Toast.show({ content: '加载订单失败', icon: 'fail' }))
        .finally(() => setLoading(false))
    }
  }, [orderId])

  const handlePay = async () => {
    if (!order) return
    setPaying(true)
    try {
      const res = await payOrder(order.id)
      if (res.success) {
        setOrder({ ...order, status: 1, payTime: new Date().toISOString() })
        Toast.show({ content: '支付成功！', icon: 'success' })
      }
    } catch (e: any) {
      Toast.show({ content: e.message || '支付失败', icon: 'fail' })
    } finally {
      setPaying(false)
    }
  }

  const status = order ? statusMap[order.status] : null
  const isPending = order?.status === 0

  return (
    <div style={{ minHeight: '100dvh', background: bg, color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0,
        }}>
          ← 返回
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>订单支付</h1>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>加载中...</div>
      ) : order ? (
        <div style={{ padding: '0 20px' }}>
          <div style={{
            padding: 24, background: 'rgba(255,255,255,0.06)', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
            }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>订单编号</span>
              <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{order.orderNo}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
            }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>商品编号</span>
              <span style={{ fontSize: 13 }}>#{order.auctionGoodsId}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
            }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>支付金额</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#ff4d4f' }}>
                ¥{order.totalAmount.toFixed(0)}
              </span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
            }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>创建时间</span>
              <span style={{ fontSize: 13 }}>{new Date(order.createdAt).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>状态</span>
              <span style={{
                fontSize: 13, fontWeight: 600, color: status?.color,
                padding: '2px 10px', borderRadius: 10, background: status?.color + '18',
              }}>
                {status?.label}
              </span>
            </div>
            {order.payTime && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12,
              }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>支付时间</span>
                <span style={{ fontSize: 13 }}>{new Date(order.payTime).toLocaleString()}</span>
              </div>
            )}
          </div>

          {isPending && (
            <div style={{ marginTop: 32 }}>
              <Button
                block size="large" color="primary"
                onClick={handlePay} loading={paying}
                style={{
                  '--adm-color-primary': '#ff4d4f',
                  height: 48, fontSize: 16, fontWeight: 700, borderRadius: 12,
                } as React.CSSProperties}
              >
                确认支付 ¥{order.totalAmount.toFixed(0)}
              </Button>
            </div>
          )}

          {!isPending && (
            <div style={{
              marginTop: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14,
            }}>
              <p>该订单已完成支付或已取消</p>
              <Button
                block size="large" color="default"
                onClick={() => navigate('/')}
                style={{ marginTop: 12, borderRadius: 12 }}
              >
                返回首页
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>
          订单不存在
        </div>
      )}
    </div>
  )
}

export default PaymentPage
