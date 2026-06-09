import { motion } from 'framer-motion'

interface SequenceItem {
  id: number
  name: string
  sortOrder: number
  startPrice: number
  status: number
}

interface AuctionSequencePanelProps {
  upcoming: SequenceItem[]
  currentId: number | null
}

const statusLabel: Record<number, string> = {
  0: '即将开始',
  1: '进行中',
  2: '已结束',
  3: '已取消',
}

const statusColor: Record<number, string> = {
  0: '#faad14',
  1: '#52c41a',
  2: '#8c8c8c',
  3: '#8c8c8c',
}

export default function AuctionSequencePanel({ upcoming, currentId }: AuctionSequencePanelProps) {
  if (upcoming.length === 0 && !currentId) return null

  return (
    <div style={{
      marginTop: 16,
      paddingBottom: 4,
    }}>
      <div style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
        marginBottom: 10,
        fontWeight: 500,
      }}>
        拍卖顺序
      </div>
      <div style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 8,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}>
        {upcoming.map((item, index) => {
          const isCurrent = item.id === currentId
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              style={{
                flex: '0 0 auto',
                minWidth: 110,
                padding: '10px 12px',
                borderRadius: 10,
                background: isCurrent
                  ? 'rgba(255,215,0,0.18)'
                  : 'rgba(255,255,255,0.06)',
                border: isCurrent
                  ? '1px solid rgba(255,215,0,0.4)'
                  : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
              }}>
                <span style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: isCurrent ? 'linear-gradient(135deg, #FFD700, #FF8C00)' : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: isCurrent ? '#000' : 'rgba(255,255,255,0.6)',
                  flexShrink: 0,
                }}>
                  {item.sortOrder || (index + 1)}
                </span>
                <span style={{
                  fontSize: 8,
                  fontWeight: 600,
                  color: statusColor[item.status],
                  textTransform: 'uppercase',
                }}>
                  {statusLabel[item.status]}
                </span>
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.name}
              </div>
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.4)',
                marginTop: 2,
              }}>
                起拍 ¥{item.startPrice.toFixed(0)}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
