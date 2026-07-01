export function joinUrl(code: string): string {
  return `${window.location.origin}/join/${code}`
}

export function obsUrl(roomId: string, obsToken: string): string {
  return `${window.location.origin}/obs/${roomId}/${obsToken}`
}

export function playUrl(code: string): string {
  return `${window.location.origin}/play/${code}`
}
