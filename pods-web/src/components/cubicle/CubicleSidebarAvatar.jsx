import { cubicle } from '../../theme/cubicle'

/** Cubicle alt avatar — çift halka, fil ikonu */
export default function CubicleSidebarAvatar({ className = '' }) {
  return (
    <div className={className}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
        <circle
          cx="24"
          cy="24"
          r="22"
          fill="none"
          stroke={cubicle.sidebarBrandRing}
          strokeWidth="2.5"
        />
        <circle
          cx="24"
          cy="24"
          r="18"
          fill={cubicle.sidebarBrandInner}
          stroke={cubicle.sidebarBrandStroke}
          strokeWidth="2"
        />
        <ellipse cx="24" cy="18" rx="8" ry="7" fill="#1E56C8" />
        <path
          d="M14 30c0-5.5 4.5-10 10-10s10 4.5 10 10v3H14v-3z"
          fill="#1E56C8"
        />
        <path
          d="M12 17c2-2.5 5.5-4 12-4s10 1.5 12 4"
          stroke="#1E56C8"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <circle cx="19" cy="18" r="1.4" fill="white" />
        <circle cx="29" cy="18" r="1.4" fill="white" />
      </svg>
    </div>
  )
}
