import React, { useState, useEffect } from 'react'
import { Form, Input, InputNumber, Button, Card, message, Space, Divider, Upload } from 'antd'
import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { getDevToken, createAuction, uploadImage } from '../api'

interface AuctionFormData {
  name: string
  description?: string
  imageUrl?: string
  startPrice: number
  incrementPrice: number
  maxPrice?: number
  durationSeconds: number
  autoDelaySeconds: number
  sortOrder?: number
  round?: number
}

const AuctionPublishPage: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
  const [fileList, setFileList] = useState<UploadFile[]>([])

  useEffect(() => {
    getDevToken()
      .then(() => message.success('管理后台已连接'))
      .catch(() => message.warning('无法连接后端，请确认后端已启动'))
  }, [])

  const handleUpload = async (file: File) => {
    try {
      const res = await uploadImage(file)
      if (res.success && res.data?.url) {
        setImageUrl(res.data.url)
        const previewUrl = res.data.url.startsWith('http') ? res.data.url : `http://localhost:3000${res.data.url}`
        setFileList([{ uid: '-1', name: file.name, status: 'done', url: previewUrl }])
        message.success('图片上传成功')
      } else {
        message.error(res.message || '上传失败')
      }
    } catch (e: any) {
      message.error(e.message || '上传失败')
    }
    return false
  }

  const onFinish = async (values: AuctionFormData) => {
    setLoading(true)
    try {
      const res = await createAuction({ ...values, imageUrl })
      if (res.success) {
        message.success('竞拍商品发布成功！')
        form.resetFields()
        setImageUrl(undefined)
        setFileList([])
      } else {
        message.error(res.message || '发布失败')
      }
    } catch (error: any) {
      message.error(error.message || '发布失败，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <Card title="发布新竞拍商品" bordered={false}>
        <Form<AuctionFormData>
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            startPrice: 0,
            incrementPrice: 10,
            durationSeconds: 300,
            autoDelaySeconds: 15,
            round: 1,
          }}
        >
          <Divider orientation="left">基本信息</Divider>

          <Form.Item
            label="商品名称"
            name="name"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input placeholder="请输入竞拍商品名称" size="large" />
          </Form.Item>

          <Form.Item label="商品描述" name="description">
            <Input.TextArea
              placeholder="详细描述商品特性"
              rows={4}
              showCount
              maxLength={500}
            />
          </Form.Item>

          <Form.Item label="商品图片">
            <Upload
              listType="picture-card"
              fileList={fileList}
              maxCount={1}
              beforeUpload={(file) => { handleUpload(file); return false }}
              onRemove={() => { setImageUrl(undefined); setFileList([]) }}
            >
              {fileList.length < 1 && (
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>上传</div>
                </div>
              )}
            </Upload>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item
              label="场次"
              name="round"
              extra="同一场次的商品为一组，进行中的场次排最前"
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="1"
                min={1}
                size="large"
              />
            </Form.Item>
            <Form.Item
              label="排序序号"
              name="sortOrder"
              extra="数字越小越靠前，留空自动排在末尾"
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="自动分配"
                min={1}
                size="large"
              />
            </Form.Item>
          </div>

          <Divider orientation="left">竞拍规则配置</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item
              label="起拍价 (元)"
              name="startPrice"
              rules={[{ required: true, message: '请输入起拍价' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="0.00"
                min={0}
                precision={2}
                size="large"
                addonAfter="元"
              />
            </Form.Item>

            <Form.Item
              label="加价幅度 (元)"
              name="incrementPrice"
              rules={[{ required: true, message: '请输入加价幅度' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="10.00"
                min={0.01}
                precision={2}
                size="large"
                addonAfter="元"
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Form.Item label="封顶价 (元，留空表示无封顶)" name="maxPrice">
              <InputNumber
                style={{ width: '100%' }}
                placeholder="不设置封顶价"
                min={0}
                precision={2}
                size="large"
                addonAfter="元"
              />
            </Form.Item>

            <Form.Item
              label="竞拍时长 (秒)"
              name="durationSeconds"
              rules={[{ required: true, message: '请输入竞拍时长' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder="300"
                min={60}
                max={3600}
                size="large"
                addonAfter="秒"
              />
            </Form.Item>
          </div>

          <Form.Item
            label="自动延时时长 (秒)"
            name="autoDelaySeconds"
            rules={[{ required: true, message: '请输入自动延时时长' }]}
            extra="倒计时剩余时间小于该值时，用户出价将自动延时"
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="15"
              min={5}
              max={60}
              size="large"
              addonAfter="秒"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: '32px' }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                icon={<PlusOutlined />}
                loading={loading}
              >
                立即发布竞拍
              </Button>
              <Button size="large" onClick={() => form.resetFields()}>
                重置表单
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default AuctionPublishPage
