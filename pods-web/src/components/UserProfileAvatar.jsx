import { useEffect, useState } from 'react'
import { avatarEmojiById } from '../lib/avatarTemplates'
import { createProfilePhotoSignedUrl } from '../lib/profilePhotoApi'
import { cn } from '../lib/cn'

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  return `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase() || '?'
}

export default function UserProfileAvatar({
  photoPath,
  avatarId,
  name,
  size = 48,
  className = '',
  imgClassName = '',
}) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    const path = String(photoPath || '').trim()
    if (!path) {
      setUrl(null)
      return undefined
    }
    let alive = true
    void createProfilePhotoSignedUrl(path, 3600)
      .then((signed) => {
        if (alive) setUrl(signed)
      })
      .catch(() => {
        if (alive) setUrl(null)
      })
    return () => {
      alive = false
    }
  }, [photoPath])

  const style = {
    width: size,
    height: size,
    fontSize: Math.max(12, Math.round(size * 0.34)),
  }

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn('rounded-full object-cover shrink-0', imgClassName, className)}
        style={style}
      />
    )
  }

  const emoji = avatarEmojiById(avatarId)
  if (emoji) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100',
          className,
        )}
        style={style}
        aria-hidden
      >
        {emoji}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800',
        className,
      )}
      style={style}
      aria-hidden
    >
      {initialsFromName(name)}
    </span>
  )
}
