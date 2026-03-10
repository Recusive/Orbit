interface RpcRequest {
  type: "rpc.request"
  method: string
  input: unknown
  id: number
}

interface RpcResult {
  type: "rpc.result"
  result: unknown
  id: number
}

interface RpcEvent {
  type: "rpc.event"
  event: string
  data: unknown
}

type RpcMessage = RpcRequest | RpcResult | RpcEvent

export namespace Rpc {
  type Definition = Record<string, (input: never) => unknown>

  export function listen(rpc: Definition): void {
    onmessage = (evt) => {
      const parsed = JSON.parse(evt.data as string) as RpcMessage
      if (parsed.type === "rpc.request") {
        const handler = (rpc as Partial<Definition>)[parsed.method]
        if (handler !== undefined) {
          void Promise.resolve(handler(parsed.input as never)).then((result) => {
            postMessage(JSON.stringify({ type: "rpc.result", result, id: parsed.id }))
          })
        }
      }
    }
  }

  export function emit(event: string, data: unknown): void {
    postMessage(JSON.stringify({ type: "rpc.event", event, data }))
  }

  export function client<T extends Definition>(target: {
    postMessage: (data: string) => void
    onmessage: ((this: Worker, ev: MessageEvent) => void) | null
  }): {
    call<Method extends keyof T>(method: Method, input: Parameters<T[Method]>[0]): Promise<ReturnType<T[Method]>>
    on(event: string, handler: (data: unknown) => void): () => void
  } {
    const pending = new Map<number, (result: unknown) => void>()
    const listeners = new Map<string, Set<(data: unknown) => void>>()
    let id = 0
    target.onmessage = (evt) => {
      const parsed = JSON.parse(evt.data as string) as RpcMessage
      if (parsed.type === "rpc.result") {
        const resolve = pending.get(parsed.id)
        if (resolve !== undefined) {
          resolve(parsed.result)
          pending.delete(parsed.id)
        }
      }
      if (parsed.type === "rpc.event") {
        const handlers = listeners.get(parsed.event)
        if (handlers !== undefined) {
          for (const handler of handlers) {
            handler(parsed.data)
          }
        }
      }
    }
    return {
      call<Method extends keyof T>(method: Method, input: Parameters<T[Method]>[0]): Promise<ReturnType<T[Method]>> {
        const requestId = id++
        return new Promise((resolve) => {
          pending.set(requestId, resolve as (result: unknown) => void)
          target.postMessage(JSON.stringify({ type: "rpc.request", method, input, id: requestId }))
        })
      },
      on(event: string, handler: (data: unknown) => void): () => void {
        let handlers = listeners.get(event)
        if (handlers === undefined) {
          handlers = new Set()
          listeners.set(event, handlers)
        }
        handlers.add(handler)
        return () => {
          handlers.delete(handler)
        }
      },
    }
  }
}
