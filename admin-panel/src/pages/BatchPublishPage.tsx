import React, { useState, useEffect, useCallback } from 'react'
import {
  Card, Table, Input, InputNumber, Button, message, Space, Collapse,
  Typography, Popconfirm,
} from 'antd'
import { PlusOutlined, DeleteOutlined, UploadOutlined, ClearOutlined } from '@ant-design/icons'
import { getDevToken, batchCreateAuctions, BatchAuctionItem } from '../api'

const { TextArea } = Input
const { Text } = Typography

interface ItemRow {
  key: string
  name: string
  description: string
  startPrice: number | null
  incrementPrice: number | null
  maxPrice: number | null
  durationSeconds: number | null
  autoDelaySeconds: number | null
  sortOrder: number | null
  round: number | null
}

let rowIdCounter = 0
function nextKey(): string {
  return `row_${++rowIdCounter}`
}

function newRow(): ItemRow {
  return {
    key: nextKey(),
    name: '',
    description: '',
    startPrice: null,
    incrementPrice: null,
    maxPrice: null,
    durationSeconds: null,
    autoDelaySeconds: null,
    sortOrder: null,
    round: null,
  }
}

const defaultSettings = {
  incrementPrice: 10,
  durationSeconds: 300,
  autoDelaySeconds: 15,
}

const BatchPublishPage: React.FC = () => {
  const [rows, setRows] = useState<ItemRow[]>([newRow(), newRow(), newRow()])
  const [loading, setLoading] = useState(false)
  const [commonIncrement, setCommonIncrement] = useState(defaultSettings.incrementPrice)
  const [commonDuration, setCommonDuration] = useState(defaultSettings.durationSeconds)
  const [commonDelay, setCommonDelay] = useState(defaultSettings.autoDelaySeconds)
  const [quickInput, setQuickInput] = useState('')

  useEffect(() => {
    getDevToken()
      .then(() => message.success('管理后台已连接'))
      .catch(() => message.warning('无法连接后端，请确认后端已启动'))
  }, [])

  const updateCell = useCallback((key: string, field: keyof ItemRow, value: any) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)))
  }, [])

  const deleteRow = useCallback((key: string) => {
    setRows(prev => {
      if (prev.length <= 1) return prev
      return prev.filter(r => r.key !== key)
    })
  }, [])

  const addRow = useCallback(() => {
    setRows(prev => [...prev, newRow()])
  }, [])

  const clearAll = useCallback(() => {
    rowIdCounter = 0
    setRows([newRow(), newRow(), newRow()])
    setQuickInput('')
  }, [])

  const parseQuickInput = useCallback(() => {
    if (!quickInput.trim()) return
    const lines = quickInput.trim().split('\n').filter(l => l.trim())
    const parsed = lines.map(line => {
      const parts = line.trim().split(/\s+/)
      const row = newRow()
      row.name = parts[0] || ''
      if (parts.length >= 2 && !isNaN(Number(parts[1]))) {
        row.startPrice = Number(parts[1])
      }
      return row
    })
    setRows(prev => {
      // Replace empty rows with parsed ones
      const existing = prev.filter(r => r.name.trim() !== '')
      return [...existing, ...parsed]
    })
    setQuickInput('')
  }, [quickInput])

  const handleSubmit = async () => {
    const filled = rows.filter(r => r.name.trim() !== '')
    if (filled.length === 0) {
      message.error('请至少添加一个商品')
      return
    }

    const emptyName = rows.find(r => r.name.trim() === '' && rows.some(r2 => r2.name.trim() !== ''))
    if (emptyName && rows.filter(r => r.name.trim() !== '').length > 0) {
      message.error('请在空行中补充商品名称，或删除空行')
      return
    }

    const items: BatchAuctionItem[] = filled.map(r => ({
      name: r.name.trim(),
      description: r.description || undefined,
      startPrice: r.startPrice ?? 0,
      incrementPrice: r.incrementPrice ?? commonIncrement,
      maxPrice: r.maxPrice ?? undefined,
      durationSeconds: r.durationSeconds ?? commonDuration,
      autoDelaySeconds: r.autoDelaySeconds ?? commonDelay,
      sortOrder: r.sortOrder ?? 0,
      round: r.round ?? 1,
    }))

    setLoading(true)
    try {
      const res = await batchCreateAuctions(items)
      if (res.success) {
        message.success(`成功发布 ${res.data?.length ?? items.length} 件商品！`)
        clearAll()
      } else {
        message.error(res.message || '批量发布失败')
      }
    } catch (error: any) {
      message.error(error.message || '发布失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      title: '#',
      width: 50,
      render: (_: any, __: any, idx: number) => (
        <Text type="secondary" style={{ fontFamily: 'monospace' }}>{idx + 1}</Text>
      ),
    },
    {
      title: <span>商品名称 <Text type="danger">*</Text></span>,
      width: 180,
      render: (_: any, r: ItemRow) => (
        <Input
          value={r.name}
          placeholder="必填"
          onChange={e => updateCell(r.key, 'name', e.target.value)}
          style={{ border: r.name.trim() ? undefined : '1px solid #ff4d4f' }}
        />
      ),
    },
    {
      title: <span>起拍价 <Text type="danger">*</Text></span>,
      width: 120,
      render: (_: any, r: ItemRow) => (
        <InputNumber
          value={r.startPrice}
          placeholder="0.00"
          min={0}
          precision={2}
          style={{ width: '100%' }}
          onChange={v => updateCell(r.key, 'startPrice', v)}
        />
      ),
    },
    {
      title: '加价幅度',
      width: 110,
      render: (_: any, r: ItemRow) => (
        <InputNumber
          value={r.incrementPrice}
          placeholder={String(commonIncrement)}
          min={0.01}
          precision={2}
          style={{ width: '100%' }}
          onChange={v => updateCell(r.key, 'incrementPrice', v)}
        />
      ),
    },
    {
      title: '封顶价',
      width: 110,
      render: (_: any, r: ItemRow) => (
        <InputNumber
          value={r.maxPrice}
          placeholder="不限"
          min={0}
          precision={2}
          style={{ width: '100%' }}
          onChange={v => updateCell(r.key, 'maxPrice', v)}
        />
      ),
    },
    {
      title: '时长(秒)',
      width: 100,
      render: (_: any, r: ItemRow) => (
        <InputNumber
          value={r.durationSeconds}
          placeholder={String(commonDuration)}
          min={60}
          max={3600}
          style={{ width: '100%' }}
          onChange={v => updateCell(r.key, 'durationSeconds', v)}
        />
      ),
    },
    {
      title: '延时(秒)',
      width: 95,
      render: (_: any, r: ItemRow) => (
        <InputNumber
          value={r.autoDelaySeconds}
          placeholder={String(commonDelay)}
          min={5}
          max={60}
          style={{ width: '100%' }}
          onChange={v => updateCell(r.key, 'autoDelaySeconds', v)}
        />
      ),
    },
    {
      title: '描述',
      width: 140,
      render: (_: any, r: ItemRow) => (
        <Input
          value={r.description}
          placeholder="选填"
          maxLength={100}
          onChange={e => updateCell(r.key, 'description', e.target.value)}
        />
      ),
    },
    {
      title: '场次',
      width: 65,
      render: (_: any, r: ItemRow) => (
        <InputNumber
          value={r.round}
          placeholder="1"
          min={1}
          style={{ width: '100%' }}
          onChange={v => updateCell(r.key, 'round', v)}
        />
      ),
    },
    {
      title: '排序',
      width: 65,
      render: (_: any, r: ItemRow) => (
        <InputNumber
          value={r.sortOrder}
          placeholder="自动"
          min={1}
          style={{ width: '100%' }}
          onChange={v => updateCell(r.key, 'sortOrder', v)}
        />
      ),
    },
    {
      title: '',
      width: 50,
      render: (_: any, r: ItemRow) => (
        <Popconfirm
          title="删除此行？"
          onConfirm={() => deleteRow(r.key)}
          disabled={rows.length <= 1}
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            disabled={rows.length <= 1}
          />
        </Popconfirm>
      ),
    },
  ]

  const filledCount = rows.filter(r => r.name.trim() !== '').length

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card title="批量上架" bordered={false}>
        {/* Common settings */}
        <Collapse
          ghost
          items={[{
            key: 'common',
            label: <Text strong>统一规则配置（所有商品的默认值，每行可单独覆盖）</Text>,
            children: (
              <Space wrap size="middle">
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    默认加价幅度 (元)
                  </Text>
                  <InputNumber
                    value={commonIncrement}
                    min={0.01}
                    precision={2}
                    style={{ width: 140 }}
                    onChange={v => setCommonIncrement(v ?? 10)}
                    addonAfter="元"
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    默认竞拍时长 (秒)
                  </Text>
                  <InputNumber
                    value={commonDuration}
                    min={60}
                    max={3600}
                    style={{ width: 140 }}
                    onChange={v => setCommonDuration(v ?? 300)}
                    addonAfter="秒"
                  />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    默认延时 (秒)
                  </Text>
                  <InputNumber
                    value={commonDelay}
                    min={5}
                    max={60}
                    style={{ width: 140 }}
                    onChange={v => setCommonDelay(v ?? 15)}
                    addonAfter="秒"
                  />
                </div>
              </Space>
            ),
          }]}
        />

        {/* Quick input */}
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            快速录入（每行一个商品，格式：商品名 起拍价）
          </Text>
          <TextArea
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            placeholder={'翡翠手镯 99.00\n和田玉吊坠 199.00\n紫砂壶 50.00'}
            rows={4}
            style={{ maxWidth: 400 }}
          />
          <Button
            onClick={parseQuickInput}
            disabled={!quickInput.trim()}
            style={{ marginTop: 8 }}
            size="small"
            icon={<UploadOutlined />}
          >
            解析并添加到列表
          </Button>
        </div>

        {/* Item table */}
        <Table<ItemRow>
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: 1050 }}
          size="small"
          rowKey="key"
          locale={{ emptyText: '暂无商品，点击下方按钮添加' }}
          footer={() => (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button type="dashed" onClick={addRow} icon={<PlusOutlined />}>
                添加商品
              </Button>
              <Text type="secondary">
                {filledCount > 0 ? `已填写 ${filledCount} 件商品` : '等待录入'}
              </Text>
            </div>
          )}
        />

        {/* Action buttons */}
        <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
          <Button
            type="primary"
            size="large"
            icon={<UploadOutlined />}
            loading={loading}
            onClick={handleSubmit}
            disabled={filledCount === 0}
          >
            批量发布 {filledCount > 0 ? `(${filledCount} 件)` : ''}
          </Button>
          <Button size="large" icon={<ClearOutlined />} onClick={clearAll} disabled={loading}>
            清空列表
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default BatchPublishPage
