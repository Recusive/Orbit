import { Log } from "./log"

interface ProcessWithInternals {
  _getActiveHandles(): unknown[]
  _getActiveRequests(): unknown[]
}

export namespace EventLoop {
  export async function wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = (): void => {
        const proc = process as unknown as ProcessWithInternals
        const active = [...proc._getActiveHandles(), ...proc._getActiveRequests()]
        Log.Default.info("eventloop", {
          active,
        })
        if (proc._getActiveHandles().length === 0 && proc._getActiveRequests().length === 0) {
          resolve()
        } else {
          setImmediate(check)
        }
      }
      check()
    })
  }
}
