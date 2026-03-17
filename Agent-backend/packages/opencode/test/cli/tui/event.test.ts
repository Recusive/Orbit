import { describe, expect, test } from "bun:test"

import { TuiEvent } from "../../../src/cli/cmd/tui/event"
import { SessionID } from "../../../src/session/schema"

describe("tui.event", () => {
  test("accepts branded session ids for session selection", () => {
    const parsed = TuiEvent.SessionSelect.properties.parse({
      sessionID: SessionID.descending(),
    })

    expect(parsed.sessionID.startsWith("ses_")).toBe(true)
  })

  test("rejects invalid session ids for session selection", () => {
    expect(() =>
      TuiEvent.SessionSelect.properties.parse({
        sessionID: "invalid_session_id",
      }),
    ).toThrow()
  })
})
