import open from "open"

import type { RGBA } from "@opentui/core"
import type { JSX } from "solid-js"

export interface LinkProps {
  href: string
  children?: JSX.Element | string
  fg?: RGBA
}

/**
 * Link component that renders clickable hyperlinks.
 * Clicking anywhere on the link text opens the URL in the default browser.
 */

export function Link(props: LinkProps): JSX.Element {
  const displayText = props.children ?? props.href

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- SolidJS JSX return type from opentui
  return (
    <text
      fg={props.fg}
      onMouseUp={() => {
        open(props.href).catch(() => {
          /* noop */
        })
      }}
    >
      {displayText}
    </text>
  )
}
