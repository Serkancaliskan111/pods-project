/** Cubicl tarzı mavi arka plan geometrik desen */
export default function LoginPattern() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="pods-login-pattern" width="120" height="120" patternUnits="userSpaceOnUse">
          <circle cx="18" cy="22" r="6" fill="currentColor" />
          <rect x="72" y="12" width="14" height="14" rx="2" fill="currentColor" />
          <path d="M38 78 L48 62 L58 78 Z" fill="currentColor" />
          <path
            d="M88 68 Q98 58 108 68 T128 68"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="98" cy="28" r="4" fill="currentColor" opacity="0.7" />
          <rect x="8" y="88" width="10" height="10" rx="2" fill="currentColor" opacity="0.65" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pods-login-pattern)" />
    </svg>
  )
}
