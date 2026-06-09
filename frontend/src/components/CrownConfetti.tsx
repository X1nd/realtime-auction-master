import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const COLORS = ['#FFD700', '#FF6B6B', '#FF8C00', '#FF69B4', '#00E5FF', '#76FF03', '#FFEA00', '#E040FB', '#FF4081', '#7C4DFF']

function generateParticles(count: number, radius: number): Array<{ id: number; x: number; y: number; color: string; delay: number; size: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5
    const dist = radius * (0.3 + Math.random() * 0.7)
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.15,
      size: Math.random() * 4 + 2,
    }
  })
}

interface BidFireworkProps {
  active: boolean
  onComplete?: () => void
}

export default function BidFirework({ active, onComplete }: BidFireworkProps) {
  const [show, setShow] = useState(false)
  const particles = useMemo(() => generateParticles(16, 60), [])

  useEffect(() => {
    if (active) {
      setShow(true)
      const timer = setTimeout(() => {
        setShow(false)
        onComplete?.()
      }, 1200)
      return () => clearTimeout(timer)
    }
    setShow(false)
  }, [active, onComplete])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {/* Center flash */}
          <motion.div
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,215,0,0.9), transparent)',
            }}
          />
          {/* Spark particles */}
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
              animate={{
                x: p.x,
                y: p.y,
                scale: [0, 1, 0.3],
                opacity: [1, 0.8, 0],
              }}
              transition={{
                duration: 0.7,
                delay: p.delay,
                ease: 'easeOut',
              }}
              style={{
                position: 'absolute',
                width: p.size,
                height: p.size,
                borderRadius: '50%',
                backgroundColor: p.color,
                boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
