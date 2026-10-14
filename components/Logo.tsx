export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M15 4v17H6z" fill="currentColor" />
      <path d="M17 8v13h9z" fill="var(--accent)" />
      <path d="M4 23h24l-3 4.5H7z" fill="currentColor" />
    </svg>
  );
}
