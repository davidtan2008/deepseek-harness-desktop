import { useRef } from 'react'

type SashProps = {
  axis: 'x' | 'y'
  invert?: boolean
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  onCommit?: (value: number) => void
}

export function Sash({ axis, invert, value, min, max, onChange, onCommit }: SashProps) {
  const start = useRef({ pos: 0, value: 0 })
  const latest = useRef(value)
  latest.current = value

  function clamp(next: number): number {
    return Math.round(Math.min(max, Math.max(min, next)))
  }

  return (
    <div
      className={axis === 'x' ? 'sash-x' : 'sash-y'}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { pos: axis === 'x' ? event.clientX : event.clientY, value }
        document.body.classList.add('sash-dragging')
        document.body.dataset.sashAxis = axis
        event.currentTarget.classList.add('active')
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        const pos = axis === 'x' ? event.clientX : event.clientY
        const delta = (pos - start.current.pos) * (invert ? -1 : 1)
        const next = clamp(start.current.value + delta)
        latest.current = next
        onChange(next)
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        event.currentTarget.classList.remove('active')
        document.body.classList.remove('sash-dragging')
        delete document.body.dataset.sashAxis
        onCommit?.(latest.current)
      }}
      onPointerCancel={(event) => {
        event.currentTarget.classList.remove('active')
        document.body.classList.remove('sash-dragging')
        delete document.body.dataset.sashAxis
      }}
    />
  )
}
