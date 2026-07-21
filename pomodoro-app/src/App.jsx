import { useState, useEffect, useRef, useCallback } from 'react'

// ── 常量 ──────────────────────────────────────────
const WORK_SEC = 25 * 60
const SHORT_BREAK_SEC = 5 * 60
const LONG_BREAK_SEC = 15 * 60
const POMODOROS_PER_LONG = 4

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// ── 环形仪表 (Precision Ring) ─────────────────────
function PrecisionRing({ radius, stroke, progress, isWork, breathing }) {
  const diameter = (radius + stroke + 6) * 2  // +6 padding for glow
  const center = radius + stroke + 6
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)))

  // 末端光点坐标 (从 12 点顺时针扫)
  const angle = progress * 2 * Math.PI
  const dotX = center + radius * Math.sin(angle)
  const dotY = center - radius * Math.cos(angle)

  const gradId = isWork ? 'g-work' : 'g-break'
  const glowId = isWork ? 'glow-work' : 'glow-break'

  return (
    <div className={`relative w-full h-full ${breathing ? 'ring-breathe' : ''}`}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${diameter} ${diameter}`}>
        <defs>
          {/* 渐变 */}
          <linearGradient id="g-work" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5F57"/><stop offset="100%" stopColor="#FF3B30"/>
          </linearGradient>
          <linearGradient id="g-break" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34C759"/><stop offset="100%" stopColor="#30B350"/>
          </linearGradient>

          {/* 发光滤镜 */}
          <filter id="glow-work" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="glow-break" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* 刻度线 (12根, 像表圈) */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * 30 - 90) * Math.PI / 180  // -90 因为 svg 旋转了
          const r1 = radius - stroke / 2 - 8
          const r2 = radius - stroke / 2
          return (
            <line key={i}
              x1={center + r1 * Math.cos(a)} y1={center + r1 * Math.sin(a)}
              x2={center + r2 * Math.cos(a)} y2={center + r2 * Math.sin(a)}
              stroke={isWork ? 'rgba(255,69,58,0.08)' : 'rgba(52,199,89,0.08)'}
              strokeWidth="1.5" strokeLinecap="round"
              className="ring-mark"
            />
          )
        })}

        {/* 轨道 */}
        <circle cx={center} cy={center} r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.04)"
          strokeWidth={stroke} strokeLinecap="round"
          className="ring-track"
        />

        {/* 进度弧 */}
        {progress > 0 && (
          <circle cx={center} cy={center} r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="ring-fill"
          />
        )}

        {/* 末端光点 */}
        {progress > 0 && (
          <circle cx={dotX} cy={dotY} r={stroke * 0.7}
            fill={isWork ? '#FF3B30' : '#34C759'}
            filter={`url(#${glowId})`}
            className="ring-glow"
          />
        )}
      </svg>
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState('work')
  const [seconds, setSeconds] = useState(WORK_SEC)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [totalToday, setTotalToday] = useState(0)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)

  const intervalRef = useRef(null)
  const audioCtxRef = useRef(null)
  const topRef = useRef(false)

  const totalSec = mode === 'work' ? WORK_SEC : mode === 'shortBreak' ? SHORT_BREAK_SEC : LONG_BREAK_SEC
  const progress = totalSec > 0 ? seconds / totalSec : 0
  const breathing = running && !paused

  // ── 提示音 ──────────────────────────────────
  const playChime = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current; const now = ctx.currentTime
      ;[880, 1100].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain()
        osc.type = 'sine'; osc.frequency.value = freq
        gain.gain.setValueAtTime(0.12, now + i * 0.15)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(now + i * 0.15); osc.stop(now + i * 0.15 + 0.5)
      })
    } catch {}
  }, [])

  // ── 计时 ────────────────────────────────────
  useEffect(() => {
    if (running && !paused && seconds > 0) {
      intervalRef.current = setInterval(() => setSeconds((s) => s - 1), 1000)
    }
    return () => clearInterval(intervalRef.current)
  }, [running, paused, seconds > 0])

  useEffect(() => {
    if (running && seconds === 0) {
      clearInterval(intervalRef.current)
      setRunning(false)
      playChime()
      if (mode === 'work') {
        const c = completed + 1; setCompleted(c); setTotalToday((t) => t + 1)
        setMode(c % POMODOROS_PER_LONG === 0 ? 'longBreak' : 'shortBreak')
        setSeconds(c % POMODOROS_PER_LONG === 0 ? LONG_BREAK_SEC : SHORT_BREAK_SEC)
      } else {
        setMode('work'); setSeconds(WORK_SEC)
      }
    }
  }, [seconds, running, mode, completed, playChime])

  useEffect(() => {
    window.electronAPI?.onTrayToggle(() => {
      setRunning((prev) => { if (prev) { setPaused((p) => !p); return !p } return true })
    })
  }, [])

  // ── 操作 ────────────────────────────────────
  const toggleTimer = () => {
    if (running && !paused) { setRunning(false); setPaused(true) }
    else if (running && paused) { setRunning(true); setPaused(false) }
    else {
      if (seconds === 0) {
        if (mode === 'work') setSeconds(WORK_SEC)
        else if (mode === 'shortBreak') setSeconds(SHORT_BREAK_SEC)
        else setSeconds(LONG_BREAK_SEC)
      }
      setRunning(true); setPaused(false)
    }
  }

  const reset = () => {
    setRunning(false); setPaused(false)
    if (mode === 'work') setSeconds(WORK_SEC)
    else if (mode === 'shortBreak') setSeconds(SHORT_BREAK_SEC)
    else setSeconds(LONG_BREAK_SEC)
  }

  const switchMode = (m) => {
    setRunning(false); setPaused(false); setMode(m)
    if (m === 'work') setSeconds(WORK_SEC)
    else if (m === 'shortBreak') setSeconds(SHORT_BREAK_SEC)
    else setSeconds(LONG_BREAK_SEC)
  }

  const toggleAlwaysOnTop = () => {
    const next = !topRef.current; topRef.current = next; setAlwaysOnTop(next)
    window.electronAPI?.toggleAlwaysOnTop(next)
  }

  // ── 派生状态 ────────────────────────────────
  const isWork = mode === 'work'
  const label = isWork ? 'F O C U S' : mode === 'shortBreak' ? 'B R E A K' : 'R E S T'

  let btnClass = 'btn-spring btn-primary'
  if (!isWork) btnClass += ' break'
  if (running && !paused) btnClass += isWork ? ' pause' : ''

  const eyebrow = isWork ? 'eyebrow eyebrow-work' : 'eyebrow eyebrow-break'

  return (
    <div className="relative w-full h-full rounded-apple overflow-hidden">
      {/* ── BG: 照片 + 轻遮罩 + 暗角 ──────────── */}
      <div className="absolute inset-0 z-0">
        <img src="./bg.jpg" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-img-overlay" />
        <div className="absolute inset-0 bg-vignette" />
      </div>

      {/* ── UI 面板 (玻璃中层) ─────────────────── */}
      <div className="relative z-10 w-full h-full rounded-apple overflow-hidden glass-mid">

        {/* ── 标题栏 ────────────────────────────── */}
        <div className="drag-region absolute top-0 left-0 right-0 h-11 flex items-center justify-between px-4 z-20">
          <div className="no-drag flex gap-2.5">
            <button onClick={() => window.electronAPI?.closeWindow()}
              className="traffic-btn bg-[#FF5F57] hover:bg-[#E54B44]" title="隐藏到托盘">
              <svg className="traffic-icon w-[6px] h-[6px]" viewBox="0 0 8 8">
                <path d="M1 1l6 6M7 1L1 7" stroke="#4A0000" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            <button onClick={() => window.electronAPI?.minimizeWindow()}
              className="traffic-btn bg-[#FFBD2E] hover:bg-[#E5A923]" title="最小化">
              <svg className="traffic-icon w-[6px] h-[6px]" viewBox="0 0 8 8">
                <path d="M1 4h6" stroke="#6B4A00" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="w-[13px] h-[13px] rounded-full bg-black/[0.05]" />
          </div>

          <div className="no-drag">
            <button onClick={toggleAlwaysOnTop}
              className={`btn-spring w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                ${alwaysOnTop ? 'bg-[#FF3B30]/12 text-[#FF3B30]' : 'text-black/[0.25] hover:text-black/[0.45] hover:bg-black/[0.04]'}`}
              title={alwaysOnTop ? '取消置顶' : '窗口置顶'}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── 主内容 ────────────────────────────── */}
        <div className="flex flex-col items-center justify-center h-full pt-1 pb-5 px-8">

          {/* 眉标 */}
          <p className={`${eyebrow} mb-4 transition-colors duration-500`}>
            {label}
          </p>

          {/* 环形仪表 */}
          <div className="relative w-[212px] h-[212px] mb-4">
            <PrecisionRing
              radius={82} stroke={7}
              progress={progress} isWork={isWork}
              breathing={breathing}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Consolas', monospace" }}
                className="text-[58px] font-medium tracking-[-0.03em] text-black/[0.88] tabular-nums leading-none"
              >
                {fmt(seconds)}
              </span>
            </div>
          </div>

          {/* ── 按钮组 ────────────────────────────── */}
          <div className="flex items-center gap-3.5 mb-5">
            <button onClick={toggleTimer}
              className={`${btnClass} text-white text-[14px] font-semibold tracking-wide
                         px-9 py-2.5 rounded-full`}
            >
              {running && !paused ? '暂停' : paused ? '继续' : '开始'}
            </button>

            <button onClick={reset}
              className="btn-spring btn-ghost text-black/[0.45] hover:text-black/[0.65] text-[14px] font-medium
                        px-5 py-2.5 rounded-full"
            >
              重置
            </button>
          </div>

          {/* ── 进度点 ────────────────────────────── */}
          <div className="flex items-center gap-2.5 mb-4">
            {Array.from({ length: POMODOROS_PER_LONG }).map((_, i) => {
              const inRound = completed % POMODOROS_PER_LONG
              const filled = completed > 0 && i < (inRound === 0 ? POMODOROS_PER_LONG : inRound)
              return <div key={i} className={`dot ${filled ? 'dot-filled' : 'dot-empty'}`} />
            })}
          </div>

          {/* ── 统计 ──────────────────────────────── */}
          <p className="text-[11px] font-medium tracking-[0.12em] text-black/[0.28] mb-4">
            今日 <span className="text-black/[0.55] font-semibold">{totalToday}</span> 个番茄
          </p>

          {/* ── 模式切换 ──────────────────────────── */}
          <div className="mode-capsule flex gap-1 p-1 rounded-full">
            {[
              { key: 'work', emoji: '🍅', tip: '工作 25 分钟' },
              { key: 'shortBreak', emoji: '☕', tip: '短休息 5 分钟' },
              { key: 'longBreak', emoji: '🌿', tip: '长休息 15 分钟' },
            ].map(({ key, emoji, tip }) => (
              <button key={key} onClick={() => switchMode(key)} title={tip}
                className={`w-[34px] h-[34px] rounded-full text-[15px] flex items-center justify-center
                  ${mode === key ? 'active' : 'hover:bg-white/40'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
