import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button, Toast } from 'antd-mobile'
import { register, login } from '../api'
import { useAuctionStore } from '../store/useAuctionStore'

const RegisterPage: React.FC = () => {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleRegister = async () => {
    if (!username || !password) {
      Toast.show({ content: '请输入用户名和密码', icon: 'fail' })
      return
    }
    if (password.length < 6) {
      Toast.show({ content: '密码至少6位', icon: 'fail' })
      return
    }
    setLoading(true)
    try {
      const res = await register(username, password)
      if (res.success) {
        Toast.show({ content: '注册成功，正在登录...', icon: 'success' })
        const loginRes = await login(username, password)
        if (loginRes.success) {
          useAuctionStore.getState().setMyUserId(loginRes.data?.userId ?? 1)
          navigate('/')
        }
      } else {
        Toast.show({ content: res.message || '注册失败', icon: 'fail' })
      }
    } catch (e: any) {
      Toast.show({ content: e.message || '注册失败', icon: 'fail' })
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
      <h1 style={{ color: 'white', fontSize: '28px', marginBottom: '40px' }}>注册账号</h1>

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
          placeholder="密码（至少6位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
          style={{
            width: '100%', padding: '14px', marginBottom: '24px',
            borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: '16px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />

        <Button block loading={loading} color="primary" size="large" onClick={handleRegister}
          style={{ '--background-image': 'linear-gradient(90deg, #ff4d4f, #ff7a45)', borderRadius: '12px', height: '48px' } as any}>
          注册
        </Button>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link to="/login" style={{ color: '#ffd700', fontSize: '14px' }}>已有账号？去登录</Link>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
