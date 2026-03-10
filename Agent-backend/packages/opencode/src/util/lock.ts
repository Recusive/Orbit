export namespace Lock {
  interface LockState {
    readers: number
    writer: boolean
    waitingReaders: (() => void)[]
    waitingWriters: (() => void)[]
  }

  const locks = new Map<string, LockState>()

  function get(key: string): LockState {
    let lock = locks.get(key)
    if (lock === undefined) {
      lock = {
        readers: 0,
        writer: false,
        waitingReaders: [],
        waitingWriters: [],
      }
      locks.set(key, lock)
    }
    return lock
  }

  function processLock(key: string): void {
    const lock = locks.get(key)
    if (lock === undefined || lock.writer || lock.readers > 0) return

    // Prioritize writers to prevent starvation
    if (lock.waitingWriters.length > 0) {
      const nextWriter = lock.waitingWriters.shift()
      if (nextWriter !== undefined) {
        nextWriter()
      }
      return
    }

    // Wake up all waiting readers
    while (lock.waitingReaders.length > 0) {
      const nextReader = lock.waitingReaders.shift()
      if (nextReader !== undefined) {
        nextReader()
      }
    }

    // Clean up empty locks
    if (lock.waitingReaders.length === 0 && lock.waitingWriters.length === 0) {
      locks.delete(key)
    }
  }

  export async function read(key: string): Promise<Disposable> {
    const lock = get(key)

    return new Promise((resolve) => {
      if (!lock.writer && lock.waitingWriters.length === 0) {
        lock.readers++
        resolve({
          [Symbol.dispose]: () => {
            lock.readers--
            processLock(key)
          },
        })
      } else {
        lock.waitingReaders.push(() => {
          lock.readers++
          resolve({
            [Symbol.dispose]: () => {
              lock.readers--
              processLock(key)
            },
          })
        })
      }
    })
  }

  export async function write(key: string): Promise<Disposable> {
    const lock = get(key)

    return new Promise((resolve) => {
      if (!lock.writer && lock.readers === 0) {
        lock.writer = true
        resolve({
          [Symbol.dispose]: () => {
            lock.writer = false
            processLock(key)
          },
        })
      } else {
        lock.waitingWriters.push(() => {
          lock.writer = true
          resolve({
            [Symbol.dispose]: () => {
              lock.writer = false
              processLock(key)
            },
          })
        })
      }
    })
  }
}
