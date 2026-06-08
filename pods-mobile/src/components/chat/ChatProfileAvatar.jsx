import React, { useEffect, useState } from 'react'
import { Avatar } from '../../ui'
import { createProfilePhotoSignedUrl } from '../../lib/profilePhotoApi'

export default function ChatProfileAvatar({ name, photoPath, size = 'md', style }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let alive = true
    const path = String(photoPath || '').trim()
    if (!path) {
      setUrl(null)
      return undefined
    }
    void createProfilePhotoSignedUrl(path, 3600).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [photoPath])

  return <Avatar name={name} url={url} size={size} style={style} />
}
