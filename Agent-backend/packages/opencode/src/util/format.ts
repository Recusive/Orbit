export function formatDuration(secs: number): string {
  if (secs <= 0) return ""
  if (secs < 60) return `${String(secs)}s`
  if (secs < 3600) {
    const mins = Math.floor(secs / 60)
    const remaining = secs % 60
    return remaining > 0 ? `${String(mins)}m ${String(remaining)}s` : `${String(mins)}m`
  }
  if (secs < 86400) {
    const hours = Math.floor(secs / 3600)
    const remaining = Math.floor((secs % 3600) / 60)
    return remaining > 0 ? `${String(hours)}h ${String(remaining)}m` : `${String(hours)}h`
  }
  if (secs < 604800) {
    const days = Math.floor(secs / 86400)
    return days === 1 ? "~1 day" : `~${String(days)} days`
  }
  const weeks = Math.floor(secs / 604800)
  return weeks === 1 ? "~1 week" : `~${String(weeks)} weeks`
}
