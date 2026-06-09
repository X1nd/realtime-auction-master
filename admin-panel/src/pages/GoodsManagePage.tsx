import React, { useEffect, useState } from 'react'
import { Table, Button, Tag, message, Space, Popconfirm, Modal, Upload } from 'antd'
import { PlayCircleOutlined, StopOutlined, ReloadOutlined, UpOutlined, DownOutlined, CaretRightOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { InputNumber, Input } from 'antd'
import type { UploadFile } from 'antd'
import { listAuctions, startAuction, cancelAuction, getDevToken, getAuctionSequence, reorderAuctions, updateAuction, clearAuctions, getCurrentUser, uploadImage } from '../api'

function computeRoundSpans(data: any[]): number[] {
  const spans: number[] = new Array(data.length).fill(1)
  let i = 0
  while (i < data.length) {
    let j = i + 1
    while (j < data.length && data[j].round === data[i].round) {
      j++
    }
    const count = j - i
    spans[i] = count
    for (let k = i + 1; k < j; k++) {
      spans[k] = 0
    }
    i = j
  }
  return spans
}

const statusMap: Record<number, { label: string; color: string }> = {
  0: { label: '未开始', color: 'orange' },
  1: { label: '进行中', color: 'green' },
  2: { label: '已结束', color: 'red' },
  3: { label: '已取消', color: 'default' },
}

const GoodsManagePage: React.FC = () => {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [ongoingId, setOngoingId] = useState<number | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    name: '', description: '', imageUrl: '' as string | undefined,
    startPrice: 0, incrementPrice: 0,
    maxPrice: undefined as number | undefined, durationSeconds: 0, autoDelaySeconds: 0, sortOrder: 0, round: 1,
  })
  const [editFileList, setEditFileList] = useState<UploadFile[]>([])

  const openEditModal = (record: any) => {
    setEditingRecord(record)
    setEditForm({
      name: record.name || '',
      description: record.description || '',
      imageUrl: record.imageUrl || undefined,
      startPrice: record.startPrice || 0,
      incrementPrice: record.incrementPrice || 0,
      maxPrice: record.maxPrice ?? undefined,
      durationSeconds: record.durationSeconds || 300,
      autoDelaySeconds: record.autoDelaySeconds || 15,
      sortOrder: record.sortOrder || 0,
      round: record.round || 1,
    })
    if (record.imageUrl) {
      const previewUrl = record.imageUrl.startsWith('http') ? record.imageUrl : `http://localhost:3000${record.imageUrl}`
      setEditFileList([{ uid: '-1', name: 'image', status: 'done', url: previewUrl }])
    } else {
      setEditFileList([])
    }
    setEditModalOpen(true)
  }

  const handleEditUpload = async (file: File) => {
    try {
      const res = await uploadImage(file)
      if (res.success && res.data?.url) {
        setEditForm(prev => ({ ...prev, imageUrl: res.data!.url }))
        const previewUrl = res.data.url.startsWith('http') ? res.data.url : `http://localhost:3000${res.data.url}`
        setEditFileList([{ uid: '-1', name: file.name, status: 'done', url: previewUrl }])
        message.success('图片上传成功')
      } else {
        message.error(res.message || '上传失败')
      }
    } catch (e: any) {
      message.error(e.message || '上传失败')
    }
    return false
  }

  const handleEditSave = async () => {
    if (!editingRecord) return
    try {
      const res = await updateAuction(editingRecord.id, {
        name: editForm.name,
        description: editForm.description,
        imageUrl: editForm.imageUrl || undefined,
        startPrice: editForm.startPrice,
        incrementPrice: editForm.incrementPrice,
        maxPrice: editForm.maxPrice ?? null as any,
        durationSeconds: editForm.durationSeconds,
        autoDelaySeconds: editForm.autoDelaySeconds,
        sortOrder: editForm.sortOrder,
        round: editForm.round,
      })
      if (res.success) {
        message.success('修改成功')
        setEditModalOpen(false)
        loadData()
      } else {
        message.error(res.message || '修改失败')
      }
    } catch (e: any) {
      message.error(e.message || '修改失败')
    }
  }

  const loadData = async (p = page) => {
    setLoading(true)
    try {
      const currentUser = getCurrentUser()
      const res = await listAuctions(p, 20, currentUser?.userId)
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

  const checkOngoing = async () => {
    try {
      const currentUser = getCurrentUser()
      const res = await getAuctionSequence(currentUser?.userId)
      if (res.success && res.data?.ongoing) {
        setOngoingId(res.data.ongoing.id)
      } else {
        setOngoingId(null)
      }
    } catch (_) {}
  }

  useEffect(() => {
    getDevToken().then(() => { loadData(); checkOngoing(); })
  }, [])

  const handleStart = async (id: number) => {
    try {
      const res = await startAuction(id)
      if (res.success) {
        message.success('竞拍已开始')
        setOngoingId(id)
        loadData()
      } else {
        message.error(res.message || '操作失败')
      }
    } catch (e: any) {
      message.error(e.message || '操作失败')
    }
  }

  const handleCancel = async (id: number) => {
    try {
      const res = await cancelAuction(id)
      if (res.success) {
        message.success('竞拍已取消')
        setOngoingId(null)
        loadData()
      } else {
        message.error(res.message || '操作失败')
      }
    } catch (e: any) {
      message.error(e.message || '操作失败')
    }
  }

  const handleMoveUp = async (record: any, index: number) => {
    if (index === 0) return
    const prev = data[index - 1]
    const items = [
      { id: record.id, sortOrder: prev.sortOrder },
      { id: prev.id, sortOrder: record.sortOrder },
    ]
    try {
      await reorderAuctions(items)
      message.success('排序已更新')
      loadData()
    } catch (e: any) {
      message.error(e.message || '排序更新失败')
    }
  }

  const handleMoveDown = async (record: any, index: number) => {
    if (index >= data.length - 1) return
    const next = data[index + 1]
    const items = [
      { id: record.id, sortOrder: next.sortOrder },
      { id: next.id, sortOrder: record.sortOrder },
    ]
    try {
      await reorderAuctions(items)
      message.success('排序已更新')
      loadData()
    } catch (e: any) {
      message.error(e.message || '排序更新失败')
    }
  }

  const handleClear = async () => {
    Modal.confirm({
      title: '确认清理',
      content: '将删除所有未进行中的竞拍商品（已结束、已取消、未开始的），进行中的竞拍会保留。此操作不可恢复，确认继续？',
      okText: '确认清理',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          const res = await clearAuctions()
          if (res.success) {
            message.success(res.message || '清理完成')
            loadData()
          } else {
            message.error(res.message || '清理失败')
          }
        } catch (e: any) {
          message.error(e.message || '清理失败')
        }
      },
    })
  }

  const handleStartNext = async () => {
    try {
      const currentUser = getCurrentUser()
      const res = await getAuctionSequence(currentUser?.userId)
      if (!res.success) return

      const upcoming = res.data?.upcoming || []
      if (upcoming.length === 0) {
        message.warning('没有待开始的竞拍')
        return
      }

      if (res.data?.ongoing) {
        Modal.confirm({
          title: '确认切换',
          content: `当前竞拍 "${res.data.ongoing.name}" 正在进行中，是否先取消再启动下一场？`,
          okText: '确认切换',
          cancelText: '取消',
          onOk: async () => {
            await cancelAuction(res.data.ongoing.id)
            await startAuction(upcoming[0].id)
            message.success(`已启动: ${upcoming[0].name}`)
            setOngoingId(upcoming[0].id)
            loadData()
          },
        })
      } else {
        await startAuction(upcoming[0].id)
        message.success(`已启动: ${upcoming[0].name}`)
        setOngoingId(upcoming[0].id)
        loadData()
      }
    } catch (e: any) {
      message.error(e.message || '操作失败')
    }
  }

  const roundSpans = computeRoundSpans(data)

  const columns = [
    { title: '场次', dataIndex: 'round', width: 60, align: 'center' as const,
      onCell: (_: any, index?: number) => ({ rowSpan: index !== undefined ? roundSpans[index] : 1 }),
    },
    { title: '排序', dataIndex: 'sortOrder', width: 60, align: 'center' as const },
    { title: 'ID', dataIndex: 'id', width: 50 },
    {
      title: '图片', dataIndex: 'imageUrl', width: 60,
      render: (v: string | null) => v
        ? <img src={v.startsWith('http') ? v : `http://localhost:3000${v}`} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
        : <span style={{ color: '#ccc' }}>-</span>,
    },
    { title: '商品名称', dataIndex: 'name' },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (s: number) => {
        const cfg = statusMap[s] || { label: '未知', color: 'default' }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: '起拍价', dataIndex: 'startPrice', width: 90,
      render: (v: number) => `¥${v.toFixed(0)}`,
    },
    {
      title: '加价幅度', dataIndex: 'incrementPrice', width: 90,
      render: (v: number) => `¥${v.toFixed(0)}`,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 170,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: '操作', key: 'action', width: 240,
      render: (_: any, record: any, index: number) => (
        <Space size="small">
          {record.status === 0 && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>编辑</Button>
              <Button size="small" icon={<UpOutlined />}
                disabled={index === 0 || data[index - 1]?.status !== 0 || data[index - 1]?.round !== record.round}
                onClick={() => handleMoveUp(record, index)} />
              <Button size="small" icon={<DownOutlined />}
                disabled={index >= data.length - 1 || data[index + 1]?.status !== 0 || data[index + 1]?.round !== record.round}
                onClick={() => handleMoveDown(record, index)} />
              <Popconfirm title="确认开始竞拍？" onConfirm={() => handleStart(record.id)}>
                <Button type="primary" size="small" icon={<PlayCircleOutlined />}>开始</Button>
              </Popconfirm>
            </>
          )}
          {record.status === 1 && (
            <Popconfirm title="确认取消竞拍？" onConfirm={() => handleCancel(record.id)}>
              <Button danger size="small" icon={<StopOutlined />}>取消</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>商品管理</h2>
        <Space>
          <Button
            type="primary"
            icon={<CaretRightOutlined />}
            onClick={handleStartNext}
          >
            {ongoingId ? '切换下一场' : '开始下一场'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => { loadData(); checkOngoing(); }}>刷新</Button>
          <Popconfirm
            title="确认清理所有非进行中的竞拍？"
            description="已结束、已取消、未开始的将被删除"
            onConfirm={handleClear}
            okText="确认清理"
            cancelText="取消"
            okType="danger"
          >
            <Button danger icon={<DeleteOutlined />}>一键清理</Button>
          </Popconfirm>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: (p) => { setPage(p); loadData(p); },
        }}
      />

      <Modal
        title={`编辑竞拍 #${editingRecord?.id || ''}`}
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => setEditModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>商品名称</label>
            <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>商品描述</label>
            <Input.TextArea rows={2} value={editForm.description}
              onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4 }}>商品图片</label>
            <Upload
              listType="picture-card"
              fileList={editFileList}
              maxCount={1}
              beforeUpload={(file) => { handleEditUpload(file); return false }}
              onRemove={() => { setEditForm({ ...editForm, imageUrl: undefined }); setEditFileList([]) }}
            >
              {editFileList.length < 1 && (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>起拍价</label>
              <InputNumber style={{ width: '100%' }} value={editForm.startPrice} min={0} step={0.01}
                onChange={v => setEditForm({ ...editForm, startPrice: v || 0 })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>加价幅度</label>
              <InputNumber style={{ width: '100%' }} value={editForm.incrementPrice} min={0.01} step={0.01}
                onChange={v => setEditForm({ ...editForm, incrementPrice: v || 0 })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>封顶价 (可选)</label>
              <InputNumber style={{ width: '100%' }} value={editForm.maxPrice} min={0} step={0.01} placeholder="不设上限"
                onChange={v => setEditForm({ ...editForm, maxPrice: v || undefined })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>场次</label>
              <InputNumber style={{ width: '100%' }} value={editForm.round} min={1} step={1}
                onChange={v => setEditForm({ ...editForm, round: v || 1 })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>排序号</label>
              <InputNumber style={{ width: '100%' }} value={editForm.sortOrder} min={0} step={1}
                onChange={v => setEditForm({ ...editForm, sortOrder: v || 0 })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>时长 (秒)</label>
              <InputNumber style={{ width: '100%' }} value={editForm.durationSeconds} min={1} step={1}
                onChange={v => setEditForm({ ...editForm, durationSeconds: v || 300 })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4 }}>延时 (秒)</label>
              <InputNumber style={{ width: '100%' }} value={editForm.autoDelaySeconds} min={0} step={1}
                onChange={v => setEditForm({ ...editForm, autoDelaySeconds: v || 15 })} />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default GoodsManagePage
