export default function Button({ children, className = '', ...props }) {
  return (
    <button
      className={
        'inline-flex items-center justify-center rounded-lg font-semibold text-white focus:outline-none btn-primary ' +
        className
      }
      {...props}
    >
      {children}
    </button>
  )
}

