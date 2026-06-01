/** Cubicle üst logosu — katlanmış belge */
export default function CubicleLogo({ className = '' }) {
  return (
    <svg
      className={className}
      width="34"
      height="34"
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M7 7h12l6 6v14a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 27V9.5A2.5 2.5 0 0 1 7 7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M19 7v6h6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path
        d="M9 14h14M9 18h11M9 22h9"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M11 11l3-2 3 2"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  )
}
