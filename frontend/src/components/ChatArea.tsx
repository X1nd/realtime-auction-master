import React, { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BidderInfo } from '../store/useAuctionStore'
import './ChatArea.css'

interface ChatAreaProps {
  messages: BidderInfo[]
  currentPrice: number
  userNames: Record<number, string>
}

const ChatArea: React.FC<ChatAreaProps> = ({ messages, currentPrice, userNames }) => {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="chat-area">
      <div className="chat-header">
        <span className="chat-title">出价动态</span>
        <span className="chat-count">{messages.length} 条</span>
      </div>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="chat-empty-icon">💬</span>
            <p>暂无出价，等待竞拍开始...</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const name = userNames[msg.userId] || `用户${msg.userId}`
              const isHighest = msg.bidPrice === currentPrice
              return (
                <motion.div
                  key={`${msg.userId}-${msg.bidTime}`}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className={`chat-message ${isHighest ? 'chat-message-highest' : ''} ${i === 0 ? 'chat-message-first' : ''}`}
                >
                  <div className="chat-message-avatar">
                    {name.charAt(0)}
                  </div>
                  <div className="chat-message-body">
                    <div className="chat-message-header">
                      <span className="chat-message-name">{name}</span>
                      <span className="chat-message-time">
                        {new Date(msg.bidTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="chat-message-price">
                      出价 <span className="price-highlight">¥{msg.bidPrice.toFixed(0)}</span>
                      {isHighest && <span className="current-badge">当前最高</span>}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

export default ChatArea
