import { useState, useEffect, useRef, useCallback } from 'react'

// ── 常量 ──────────────────────────────────────────
const WORK_SEC = 25 * 60
const SHORT_BREAK_SEC = 5 * 60
const LONG_BREAK_SEC = 15 * 60
const POMODOROS_PER_LONG = 4

// ── 工具函数 ──────────────────────────────────────
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

// ── 环形进度条组件 ─────────────────────────────────
function ProgressRing({ radius, stroke, progress, isWork }) {
  const normalized = Math.max(0, Math.min(1, progress))
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - normalized)

  return (
    <svg
      className="w-full h-full -rotate-90"
      viewBox={`0 0 ${(radius + stroke) * 2} ${(radius + stroke) * 2}`}
    >
      {/* 背景轨道 */}
      <circle
        cx={radius + stroke}
        cy={radius + stroke}
        r={radius}
        fill="none"
        stroke={isWork ? 'rgba(255, 69, 58, 0.15)' : 'rgba(52, 199, 89, 0.15)'}
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      {/* 进度弧 */}
      <circle
        cx={radius + stroke}
        cy={radius + stroke}
        r={radius}
        fill="none"
        stroke={isWork ? 'rgba(255, 69, 58, 0.85)' : 'rgba(52, 199, 89, 0.85)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="ring-progress"
      />
    </svg>
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

  // ── 总秒数 ────────────────────────────────────
  const totalSec = mode === 'work'
    ? WORK_SEC
    : mode === 'shortBreak'
      ? SHORT_BREAK_SEC
      : LONG_BREAK_SEC

  const progress = totalSec > 0 ? seconds / totalSec : 0

  // ── 播放提示音 (Web Audio API) ──────────────────
  const playChime = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const now = ctx.currentTime

      const notes = [880, 1100]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.15, now + i * 0.15)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + i * 0.15)
        osc.stop(now + i * 0.15 + 0.5)
      })
    } catch { /* 降级 */ }
  }, [])

  // ── 计时逻辑 ──────────────────────────────────
  useEffect(() => {
    if (running && !paused && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s - 1)
      }, 1000)
    }
    return () => clearInterval(intervalRef.current)
  }, [running, paused, seconds > 0])

  // 倒计时归零
  useEffect(() => {
    if (running && seconds === 0) {
      clearInterval(intervalRef.current)
      setRunning(false)
      playChime()

      if (mode === 'work') {
        const newCompleted = completed + 1
        setCompleted(newCompleted)
        setTotalToday((t) => t + 1)

        if (newCompleted % POMODOROS_PER_LONG === 0) {
          setMode('longBreak')
          setSeconds(LONG_BREAK_SEC)
        } else {
          setMode('shortBreak')
          setSeconds(SHORT_BREAK_SEC)
        }
      } else {
        setMode('work')
        setSeconds(WORK_SEC)
      }
    }
  }, [seconds, running, mode, completed, playChime])

  // ── 托盘消息监听 ──────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.onTrayToggle) {
      window.electronAPI.onTrayToggle(() => {
        setRunning((prev) => {
          if (prev) {
            setPaused((p) => !p)
            return !p
          }
          return true
        })
      })
    }
  }, [])

  // ── 操作函数 ──────────────────────────────────
  const toggleTimer = () => {
    if (running && !paused) {
      setRunning(false)
      setPaused(true)
    } else if (running && paused) {
      setRunning(true)
      setPaused(false)
    } else {
      if (seconds === 0) {
        if (mode === 'work') setSeconds(WORK_SEC)
        else if (mode === 'shortBreak') setSeconds(SHORT_BREAK_SEC)
        else setSeconds(LONG_BREAK_SEC)
      }
      setRunning(true)
      setPaused(false)
    }
  }

  const reset = () => {
    setRunning(false)
    setPaused(false)
    if (mode === 'work') setSeconds(WORK_SEC)
    else if (mode === 'shortBreak') setSeconds(SHORT_BREAK_SEC)
    else setSeconds(LONG_BREAK_SEC)
  }

  const switchMode = (m) => {
    setRunning(false)
    setPaused(false)
    setMode(m)
    if (m === 'work') setSeconds(WORK_SEC)
    else if (m === 'shortBreak') setSeconds(SHORT_BREAK_SEC)
    else setSeconds(LONG_BREAK_SEC)
  }

  const toggleAlwaysOnTop = () => {
    const next = !topRef.current
    topRef.current = next
    setAlwaysOnTop(next)
    window.electronAPI?.toggleAlwaysOnTop(next)
  }

  // ── 计算按钮状态 ──────────────────────────────
  const isWork = mode === 'work'
  const statusLabel = isWork ? '专注' : mode === 'shortBreak' ? '短休息' : '长休息'
  const statusEmoji = isWork ? '🍅' : mode === 'shortBreak' ? '☕' : '🌿'
  const accentColor = isWork ? 'text-[#FF453A]' : 'text-[#34C759]'
  const accentBg = isWork ? 'bg-[#FF453A]' : 'bg-[#34C759]'
  const accentBgHover = isWork ? 'hover:bg-[#E0352B]' : 'hover:bg-[#2BAC4A]'

  // ── 标题栏按钮 ────────────────────────────────
  const handleClose = () => window.electronAPI?.closeWindow()
  const handleMinimize = () => window.electronAPI?.minimizeWindow()

  return (
    <div className="relative w-full h-full rounded-apple overflow-hidden">
      {/* ── 背景图片层 ────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <img
          src="./bg.jpg"
          alt=""
          className="w-full h-full object-cover"
        />
        {/* 毛玻璃遮罩：保留 Apple 风格，让图透出 */}
        <div className="absolute inset-0 bg-white/15 backdrop-blur-[1px]" />
      </div>

      {/* ── UI 层 ──────────────────────────────── */}
      <div className="relative z-10 w-full h-full rounded-apple overflow-hidden"
           style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(4px) saturate(150%)', WebkitBackdropFilter: 'blur(4px) saturate(150%)' }}>

        {/* ── 自定义标题栏 ──────────────────────── */}
        <div className="drag-region absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-4 z-10">
          {/* 左侧: macOS 红绿灯 */}
          <div className="no-drag flex gap-2.5">
            <button
              onClick={handleClose}
              className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] hover:bg-[#E54B44]
                         transition-colors duration-200 flex items-center justify-center group"
              title="隐藏到托盘"
            >
              <svg className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 8 8">
                <path d="M1 1l6 6M7 1L1 7" stroke="#4A0000" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            <button
              onClick={handleMinimize}
              className="w-3.5 h-3.5 rounded-full bg-[#FFBD2E] hover:bg-[#E5A923]
                         transition-colors duration-200 flex items-center justify-center group"
              title="最小化"
            >
              <svg className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 8 8">
                <path d="M1 4h6" stroke="#6B4A00" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="w-3.5 h-3.5 rounded-full bg-[#D1D3D6]" title="全屏(不可用)"/>
          </div>

          {/* 右侧: 置顶按钮 */}
          <div className="no-drag">
            <button
              onClick={toggleAlwaysOnTop}
              className={`btn-spring w-7 h-7 rounded-full flex items-center justify-center
                         transition-all duration-300
                         ${alwaysOnTop
                           ? 'bg-[#FF453A]/20 text-[#FF453A]'
                           : 'bg-black/[0.08] text-[#86868B] hover:bg-black/[0.15]'
                         }`}
              title={alwaysOnTop ? '取消置顶' : '窗口置顶'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── 主内容 ─────────────────────────────── */}
        <div className="flex flex-col items-center justify-center h-full pt-4 pb-6 px-8">

          {/* 状态标签 */}
          <p className={`text-sm font-semibold tracking-wide ${accentColor} mb-3 transition-colors duration-500 drop-shadow-sm`}>
            {statusEmoji} {statusLabel}
          </p>

          {/* 环形进度条 + 时间 */}
          <div className="relative w-[220px] h-[220px] mb-5">
            <ProgressRing radius={95} stroke={9} progress={progress} isWork={isWork}/>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-[56px] font-semibold tracking-tighter text-[#1D1D1F] tabular-nums leading-none drop-shadow-sm"
                style={{ fontFamily: "'SF Mono', 'JetBrains Mono', 'Consolas', monospace" }}
              >
                {fmt(seconds)}
              </span>
            </div>
          </div>

          {/* ── 控制按钮组 ────────────────────────── */}
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={toggleTimer}
              className={`btn-spring text-white text-[15px] font-medium
                         px-8 py-3 rounded-full shadow-lg shadow-black/15
                         active:shadow-sm active:translate-y-px
                         ${running && !paused
                           ? 'bg-[#FF9F0A] hover:bg-[#E08C00]'
                           : `${accentBg} ${accentBgHover}`
                         }`}
            >
              {running && !paused ? '暂停' : paused ? '继续' : '开始'}
            </button>

            <button
              onClick={reset}
              className="btn-spring bg-white/60 hover:bg-white/80 text-[#1D1D1F]/80 text-[15px] font-medium
                        px-5 py-3 rounded-full transition-colors backdrop-blur-sm"
            >
              重置
            </button>
          </div>

          {/* ── 番茄进度点 ────────────────────────── */}
          <div className="flex items-center gap-3 mb-3">
            {Array.from({ length: POMODOROS_PER_LONG }).map((_, i) => {
              const idxInRound = completed % POMODOROS_PER_LONG
              const isFilled = completed > 0 && i < (idxInRound === 0 ? POMODOROS_PER_LONG : idxInRound)
              return (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                    isFilled
                      ? 'bg-[#FF453A] scale-100 shadow shadow-[#FF453A]/30'
                      : 'bg-black/[0.10] scale-90'
                  }`}
                />
              )
            })}
          </div>

          {/* ── 今日统计 ──────────────────────────── */}
          <p className="text-xs text-[#1D1D1F]/60 font-medium tracking-wide">
            今日已完成 <span className="text-[#1D1D1F]/80 font-semibold">{totalToday}</span> 个番茄
          </p>

          {/* ── 模式切换 ──────────────────────────── */}
          <div className="mt-5 flex gap-1.5 bg-white/40 backdrop-blur-md p-1 rounded-full">
            {[
              { key: 'work', label: '🍅', tooltip: '工作 25 分钟' },
              { key: 'shortBreak', label: '☕', tooltip: '短休息 5 分钟' },
              { key: 'longBreak', label: '🌿', tooltip: '长休息 15 分钟' },
            ].map(({ key, label, tooltip }) => (
              <button
                key={key}
                onClick={() => switchMode(key)}
                title={tooltip}
                className={`btn-spring w-9 h-9 rounded-full text-sm flex items-center justify-center
                           transition-all duration-300
                           ${mode === key
                             ? 'bg-white shadow-md shadow-black/10 text-base'
                             : 'text-base hover:bg-white/50'
                           }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
