import z from "zod"

import { BusEvent } from "@/bus/bus-event"

export const Event = {
  Connected: BusEvent.define("server.connected", z.object({})),
  Disposed: BusEvent.define("global.disposed", z.object({})),
}
