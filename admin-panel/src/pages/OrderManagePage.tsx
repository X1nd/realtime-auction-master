import React, { useEffect, useState } from 'react'
import { Table, Tag, Button, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { listOrders, getDevToken, markOrderPaid } from '../api'

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: '待支付', color: 'orange' },
  1: { label: '已支付', color: 'green' },
  2: { label: '已取消', color: 'default' },
}

const OrderManagePage: React.FC = () => {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const loadData = async (p = page) => {
    setLoading(true)
    try {
      const res = await listOrders(p, 10)
      if (res.success) {
        setData(res.data.list || [])
        setTotal(res.data.total || 0)
      }
    } catch (e: any) {
      message.error(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getDevToken().then(() => loadData())
  }, [])

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '订单号', dataIndex: 'orderNo', width: 220 },
    { title: '拍卖商品ID', dataIndex: 'auctionGoodsId', width: 100 },
    { title: '用户ID', dataIndex: 'userId', width: 80 },
    {
      title: '金额', dataIndex: 'totalAmount', width: 120,
      render: (v: number) => <span style={{ fontWeight: 'bold', color: '#ff4d4f' }}>¥{v.toFixed(0)}</span>,
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s: number) => {
        const cfg = statusMap[s] || { label: '未知', color: 'default' }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 180,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, record: any) => {
        if (record.status === 0) {
          return (
            <Button
              size="small" type="primary"
              onClick={async () => {
                try {
                  await markOrderPaid(record.id)
                  message.success('已标记为已支付')
                  loadData()
                } catch (e: any) {
                  message.error(e.message || '操作失败')
                }
              }}
            >
              标记已支付
            </Button>
          )
        }
        return null
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>订单管理</h2>
        <Button icon={<ReloadOutlined />} onClick={() => loadData()}>刷新</Button>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 10,
          onChange: (p) => { setPage(p); loadData(p); },
        }}
      />
    </div>
  )
}

export default OrderManagePage
