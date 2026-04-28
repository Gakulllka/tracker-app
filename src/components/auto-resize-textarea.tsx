"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  ({ className, onChange, maxRows = 10, ...props }, ref) => {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const savedHeight = React.useRef<string | null>(null)

    const adjustHeight = React.useCallback(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      textarea.style.height = "auto"
      const scrollHeight = textarea.scrollHeight
      const newHeight = Math.min(scrollHeight, maxRows * 24)
      const h = Math.max(40, newHeight)
      textarea.style.height = `${h}px`
      savedHeight.current = `${h}px`
    }, [maxRows])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e)
      adjustHeight()
    }

    React.useLayoutEffect(() => {
      if (savedHeight.current && textareaRef.current) {
        textareaRef.current.style.height = savedHeight.current
      }
    })

    return (
      <textarea
        ref={(el) => {
          textareaRef.current = el
          if (typeof ref === "function") {
            ref(el)
          } else if (ref) {
            ref.current = el
          }
        }}
        className={cn(
          "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        onChange={handleChange}
        {...props}
      />
    )
  }
)

AutoResizeTextarea.displayName = "AutoResizeTextarea"

export { AutoResizeTextarea }