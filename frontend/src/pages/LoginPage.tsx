import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button, Toast } from 'antd-mobile'
import { login, getDevToken } from '../api'
import { useAuctionStore } from '../store/useAuctionStore'

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    if (!username || !password) {
      Toast.show({ content: '请输入用户名和密码', icon: 'fail' })
      return
    }
    setLoading(true)
    try {
      const res = await login(username, password)
      if (res.success) {
        useAuctionStore.getState().setMyUserId(res.data?.userId ?? 1)
        Toast.show({ content: '登录成功', icon: 'success' })
        navigate('/')
      } else {
        Toast.show({ content: res.message || '登录失败', icon: 'fail' })
      }
    } catch (e: any) {
      Toast.show({ content: e.message || '登录失败', icon: 'fail' })
    } finally {
      setLoading(false)
    }
  }

  const handleDevLogin = async () => {
    setLoading(true)
    try {
      const res = await getDevToken()
      if (res.success) {
        useAuctionStore.getState().setMyUserId(res.data?.userId ?? 1)
        Toast.show({ content: '开发登录成功', icon: 'success' })
        navigate('/')
      }
    } catch (e: any) {
      Toast.show({ content: '开发登录失败', icon: 'fail' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <h1 style={{ color: 'white', fontSize: '28px', marginBottom: '40px' }}>实时竞拍大师</h1>

      <div style={{ width: '100%', maxWidth: '360px' }}>
        <input
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            width: '100%', padding: '14px', marginBottom: '16px',
            borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '16px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          style={{
            width: '100%', padding: '14px', marginBottom: '24px',
            borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '16px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />

        <Button block loading={loading} color="primary" size="large" onClick={handleLogin}
          style={{ '--background-image': 'linear-gradient(90deg, #ff4d4f, #ff7a45)', borderRadius: '12px', height: '48px' } as any}>
          登录
        </Button>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link to="/register" style={{ color: '#ffd700', fontSize: '14px' }}>没有账号？去注册</Link>
        </div>

        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <button onClick={handleDevLogin}
            style={{
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.3)',
              color: 'rgba(255,255,255,0.5)', padding: '10px 24px', borderRadius: '8px',
              cursor: 'pointer', fontSize: '13px',
            }}>
            一键开发登录
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
