import { Clipboard } from "./clipboard"

interface Toast {
  show: (input: { message: string; variant: "info" | "success" | "warning" | "error" }) => void
  error: (err: unknown) => void
}

interface Renderer {
  getSelection: () => { getSelectedText: () => string } | null
  clearSelection: () => void
}

export namespace Selection {
  export function copy(renderer: Renderer, toast: Toast): boolean {
    const text = renderer.getSelection()?.getSelectedText()
    if (!text) return false

    Clipboard.copy(text)
      .then(() => {
        toast.show({ message: "Copied to clipboard", variant: "info" })
      })
      .catch(toast.error)

    renderer.clearSelection()
    return true
  }
}
