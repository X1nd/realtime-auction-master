import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Select } from 'antd'
import { DashboardOutlined, PlusOutlined, ShoppingOutlined, OrderedListOutlined, UnorderedListOutlined, UserOutlined } from '@ant-design/icons'
import DashboardPage from './pages/DashboardPage'
import AuctionPublishPage from './pages/AuctionPublishPage'
import GoodsManagePage from './pages/GoodsManagePage'
import OrderManagePage from './pages/OrderManagePage'
import BatchPublishPage from './pages/BatchPublishPage'
import { getMerchantRooms, getDevTokenForUser, getCurrentUser, getDevToken } from './api'

interface MerchantInfo {
  userId: number
  username: string
  nickname: string
}

function roomToMerchant(r: any): MerchantInfo {
  return { userId: r.userId, username: r.username, nickname: r.nickname || r.username }
}

const { Header, Content, Sider } = Layout

const AppContent: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [merchants, setMerchants] = useState<MerchantInfo[]>([])
  const [currentUser, setCurrentUser] = useState(getCurrentUser())
  const [switching, setSwitching] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    getDevToken().then(() => loadUsers()).catch(() => loadUsers())
  }, [])

  const loadUsers = async () => {
    try {
      const res = await getMerchantRooms()
      if (res.success && res.data) {
        const list = (res.data || []).map(roomToMerchant)
        setMerchants(list)
        // Auto-switch to first merchant if current user is not a merchant
        if (!initialized && list.length > 0) {
          const cur = getCurrentUser()
          const isMerchant = list.some((m: MerchantInfo) => m.userId === cur?.userId)
          if (!isMerchant && !switching) {
            setInitialized(true)
            handleSwitchUser(list[0].userId)
            return
          }
        }
        setInitialized(true)
      }
    } catch (e) {
      console.error('加载直播间列表失败', e)
    }
  }

  const handleSwitchUser = async (userId: number) => {
    const m = merchants.find(u => u.userId === userId)
    if (!m || switching) return
    setSwitching(true)
    try {
      await getDevTokenForUser(m.username)
      setCurrentUser({ userId: m.userId, username: m.username, nickname: m.nickname || m.username })
      window.location.reload()
    } catch (e) {
      console.error('切换用户失败', e)
      setSwitching(false)
    }
  }

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '控制台',
    },
    {
      key: '/publish',
      icon: <PlusOutlined />,
      label: '发布竞拍',
    },
    {
      key: '/batch-publish',
      icon: <UnorderedListOutlined />,
      label: '批量上架',
    },
    {
      key: '/goods',
      icon: <ShoppingOutlined />,
      label: '商品管理',
    },
    {
      key: '/orders',
      icon: <OrderedListOutlined />,
      label: '订单管理',
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        theme="dark" 
        width={200} 
        collapsible 
        collapsed={collapsed}
        onCollapse={setCollapsed}
      >
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          color: 'white', 
          fontSize: collapsed ? '14px' : '16px', 
          fontWeight: 'bold',
          padding: '0 16px',
          overflow: 'hidden'
        }}>
          {collapsed ? '竞拍' : '实时竞拍管理'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          <UserOutlined style={{ fontSize: 16, color: '#999' }} />
          <Select
            style={{ minWidth: 180 }}
            value={currentUser?.userId}
            onChange={handleSwitchUser}
            loading={switching}
            placeholder="选择商家身份"
            options={merchants.map(m => ({
              value: m.userId,
              label: `${m.nickname || m.username} (ID:${m.userId})`,
            }))}
          />
        </Header>
        <Content style={{ margin: '24px', background: '#fff', borderRadius: '8px', minHeight: 'calc(100vh - 112px)' }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/publish" element={<AuctionPublishPage />} />
            <Route path="/batch-publish" element={<BatchPublishPage />} />
            <Route path="/goods" element={<GoodsManagePage />} />
            <Route path="/orders" element={<OrderManagePage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
