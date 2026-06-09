import * as RadixTooltip from '@radix-ui/react-tooltip'

export function TooltipProvider({ children }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={100}>
      {children}
    </RadixTooltip.Provider>
  )
}

export function Tooltip({ content, children, side = 'top' }) {
  if (!content) return children
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[9999] rounded px-2 py-1 text-xs font-medium text-white bg-gray-900 shadow-md select-none data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95"
        >
          {content}
          <RadixTooltip.Arrow className="fill-gray-900" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
