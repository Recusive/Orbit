import { expect, test } from "bun:test"
import { Schema } from "effect"

import { WorkspaceID } from "../../src/control-plane/schema"
import { PermissionID } from "../../src/permission/schema"
import { ProjectID } from "../../src/project/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { PtyID } from "../../src/pty/schema"
import { QuestionID } from "../../src/question/schema"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { ToolID } from "../../src/tool/schema"
import { zod } from "../../src/util/effect-zod"
import { withStatics } from "../../src/util/schema"

test("withStatics attaches static helpers to schemas", () => {
  const stringSchema = Schema.String
  const BrandedString = stringSchema.pipe(
    withStatics((schema: typeof stringSchema) => ({
      make: (value: string) => schema.makeUnsafe(value),
    })),
  )

  expect(BrandedString.make("orbit")).toBe("orbit")
})

test("branded ID schemas generate expected prefixes and constants", () => {
  const sessionID = SessionID.descending()
  const messageID = MessageID.ascending()
  const partID = PartID.ascending()
  const workspaceID = WorkspaceID.ascending()
  const permissionID = PermissionID.ascending()
  const ptyID = PtyID.ascending()
  const questionID = QuestionID.ascending()
  const toolID = ToolID.ascending()

  expect(sessionID.startsWith("ses_")).toBe(true)
  expect(messageID.startsWith("msg_")).toBe(true)
  expect(partID.startsWith("prt_")).toBe(true)
  expect(workspaceID.startsWith("wrk_")).toBe(true)
  expect(permissionID.startsWith("per_")).toBe(true)
  expect(ptyID.startsWith("pty_")).toBe(true)
  expect(questionID.startsWith("que_")).toBe(true)
  expect(toolID.startsWith("tool_")).toBe(true)

  expect(String(ProviderID.orbit)).toBe("orbit")
  expect(String(ProviderID.openai)).toBe("openai")
  expect(String(ModelID.make("claude-sonnet-4-20250514"))).toBe("claude-sonnet-4-20250514")
  expect(String(ProjectID.global)).toBe("global")

  expect(SessionID.zod.parse(sessionID)).toBe(sessionID)
  expect(MessageID.zod.parse(messageID)).toBe(messageID)
  expect(PartID.zod.parse(partID)).toBe(partID)
  expect(WorkspaceID.zod.parse(workspaceID)).toBe(workspaceID)
  expect(PermissionID.zod.parse(permissionID)).toBe(permissionID)
  expect(PtyID.zod.parse(ptyID)).toBe(ptyID)
  expect(QuestionID.zod.parse(questionID)).toBe(questionID)
  expect(ToolID.zod.parse(toolID)).toBe(toolID)
  expect(String(ProviderID.zod.parse(ProviderID.orbit))).toBe("orbit")
  expect(String(ProjectID.zod.parse(ProjectID.global))).toBe("global")
})

test("effect-zod converts effect schemas with objects and optionals", () => {
  const effectSchema = Schema.Struct({
    id: Schema.String,
    enabled: Schema.Boolean,
    label: Schema.optional(Schema.String),
  })

  const parsed = zod(effectSchema).parse({
    id: "ses_test",
    enabled: true,
  })

  expect(parsed).toEqual({
    id: "ses_test",
    enabled: true,
  })
})
