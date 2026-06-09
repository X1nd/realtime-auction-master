import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { BidderInfo } from '../store/useAuctionStore'
import './RealTimeRankList.css'

interface RealTimeRankListProps {
  rankList: BidderInfo[]
}

const RealTimeRankList: React.FC<RealTimeRankListProps> = ({ rankList }) => {
  const sorted = [...rankList].sort((a, b) => b.bidPrice - a.bidPrice)

  return (
    <div className="rank-list-container">
      <h3 className="rank-title">🏆 实时排行榜</h3>
      <div className="rank-list">
        <AnimatePresence mode="popLayout">
          {sorted.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="empty-rank"
            >
              暂无出价记录
            </motion.div>
          ) : (
            sorted.map((bidder, index) => (
              <motion.div
                key={`${bidder.userId}-${bidder.bidPrice}`}
                layout
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={`rank-item rank-${index + 1}`}
              >
                <div className="rank-number">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </div>
                <div className="rank-user">
                  <span className="username">{bidder.username}</span>
                </div>
                <div className="rank-price">
                  <span className="price-text">¥{bidder.bidPrice.toFixed(0)}</span>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default RealTimeRankList
