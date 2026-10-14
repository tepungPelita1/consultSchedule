import type { SVGProps } from 'react'
import { cn } from '@/lib/utils'

/** Small mascot cat (DESIGN.md §2) — flat, clean, thin-ish outline. */
export function Cat({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 150 120"
      className={cn('h-16 w-20 text-ink', className)}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={5}
      strokeLinejoin="round"
      {...props}
    >
      <path d="M30 118V62C30 30 50 18 75 18s45 12 45 44v56z" fill="#FDF7F3" />
      <path d="M36 34L30 6l26 14zM114 34l6-28-26 14z" fill="#FDF7F3" />
      <path d="M38 24l-3-10 10 6zM112 24l3-10-10 6z" fill="#F0CCC3" strokeWidth={2} />
      <ellipse cx="57" cy="52" rx="7" ry="8" fill="#4CA460" />
      <ellipse cx="93" cy="52" rx="7" ry="8" fill="#4CA460" />
      <path d="M70 68h10l-5 6z" fill="#F0CCC3" strokeWidth={3} />
      <path d="M75 74v6M66 82q9 6 18 0" strokeWidth={3} />
    </svg>
  )
}
