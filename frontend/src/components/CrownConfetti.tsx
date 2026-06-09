import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Particle {
  id: number
  x: number
  y: number
  rotation: number
  scale: number
  color: string
  delay: number
  duration: number
  size: number
}

const COLORS = ['#FFD700', '#FF4D4F', '#FF8C00', '#FF69B4', '#00E5FF', '#76FF03', '#FFEA00', '#E040FB']

function generateParticles(compact: boolean): Particle[] {
  const count = compact ? 20 : 40
  const spreadX = compact ? 180 : 400
  const spreadY = compact ? 120 : 300
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * spreadX * 2,
    y: -(Math.random() * spreadY + 60),
    rotation: Math.random() * 720 - 360,
    scale: Math.random() * 1 + 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 0.3,
    duration: Math.random() * 1.5 + 1.5,
    size: Math.random() * 6 + 3,
  }))
}

interface CrownConfettiProps {
  active: boolean
  compact?: boolean
  onComplete?: () => void
}

export default function CrownConfetti({ active, compact = false, onComplete }: CrownConfettiProps) {
  const [show, setShow] = useState(false)
  const particles = useMemo(() => generateParticles(compact), [compact])

  useEffect(() => {
    if (active) {
      setShow(true)
      const timer = setTimeout(() => {
        setShow(false)
        onComplete?.()
      }, 2800)
      return () => clearTimeout(timer)
    } else {
      setShow(false)
    }
  }, [active, onComplete])

  const crownSize = compact ? 56 : 96
  const containerStyle = compact
    ? { position: 'absolute' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' as const, zIndex: 10 }
    : { position: 'fixed' as const, inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' as const }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          style={containerStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 0 }}
              animate={{
                opacity: [1, 1, 0],
                x: p.x,
                y: [0, p.y * 0.5, p.y + (compact ? 40 : 80)],
                rotate: p.rotation,
                scale: [0, p.scale, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: 'easeOut',
              }}
              style={{
                position: 'absolute',
                width: p.size,
                height: p.size,
                borderRadius: '50%',
                backgroundColor: p.color,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              }}
            />
          ))}

          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{
              scale: [0, 1.3, 1],
              rotate: [0, 10, 0],
            }}
            transition={{
              type: 'spring',
              stiffness: 200,
              damping: 12,
              delay: 0.15,
            }}
            style={{
              fontSize: crownSize,
              filter: 'drop-shadow(0 0 30px rgba(255,215,0,0.9)) drop-shadow(0 0 60px rgba(255,215,0,0.5))',
              zIndex: 1,
            }}
          >
            👑
          </motion.div>

          <motion.div
            initial={{ scale: 0, opacity: 1 }}
            animate={{ scale: compact ? 2 : 3, opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              width: crownSize,
              height: crownSize,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,215,0,0.6), transparent)',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
