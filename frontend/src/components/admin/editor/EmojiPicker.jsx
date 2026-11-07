import { useEffect, useRef } from 'react'
import { Picker } from 'emoji-mart'

// Local stand-in for @emoji-mart/react, which still peer-requires React <=18
// (blocking the React 19 upgrade, and failing the Pi's `npm ci`). That
// package is only a thin wrapper around emoji-mart's own Picker class, which
// has no React dependency at all, so this mirrors it line for line: mount a
// container div, construct the Picker into it once, and push later prop
// changes through instance.update().
//
// One small addition: the effect cleanup also empties the container, so the
// old picker element is detached (its disconnectedCallback unregisters it)
// during StrictMode's dev-only mount/unmount/mount instead of lingering until
// the next Picker's constructor clears the div. In production the cleanup
// only runs on a real unmount, when React removes the div anyway, so
// production behavior is unchanged.
export default function EmojiPicker(props) {
  const ref = useRef(null)
  const instance = useRef(null)

  if (instance.current) instance.current.update(props)

  useEffect(() => {
    const container = ref.current
    instance.current = new Picker({ ...props, ref })
    return () => {
      instance.current = null
      if (container) container.replaceChildren()
    }
    // Mount-only, like upstream: later prop changes go through update() above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={ref} />
}
