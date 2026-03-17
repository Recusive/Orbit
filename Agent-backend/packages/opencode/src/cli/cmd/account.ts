import { Duration, Effect, Match, Option } from "effect"
import open from "open"

import * as Prompt from "../effect/prompt"
import { UI } from "../ui"

import { cmd } from "./cmd"

import type { AccountError } from "@/account/schema"
import type { AccountID, OrgID, PollResult } from "@/account/service"

import { AccountService, PollExpired } from "@/account/service"
import { runtime } from "@/effect/runtime"

const openBrowser = (url: string): Effect.Effect<void> =>
  Effect.promise(() =>
    open(url)
      .then(() => undefined)
      .catch(() => undefined),
  )

const println = (msg: string): Effect.Effect<void> =>
  Effect.sync(() => {
    UI.println(msg)
  })

const loginEffect = Effect.fn("login")(function* (url: string) {
  const service = yield* AccountService

  yield* Prompt.intro("Log in")
  const login = yield* service.login(url)

  yield* Prompt.log.info("Go to: " + login.url)
  yield* Prompt.log.info("Enter code: " + login.user)
  yield* openBrowser(login.url)

  const s = Prompt.spinner()
  yield* s.start("Waiting for authorization...")

  const poll = (wait: Duration.Duration): Effect.Effect<PollResult, AccountError> =>
    Effect.gen(function* () {
      yield* Effect.sleep(wait)
      const result = yield* service.poll(login)
      if (result._tag === "PollPending") return yield* poll(wait)
      if (result._tag === "PollSlow") return yield* poll(Duration.sum(wait, Duration.seconds(5)))
      return result
    })

  const result = yield* poll(login.interval).pipe(
    Effect.timeout(login.expiry),
    Effect.catchTag("TimeoutError", () => Effect.succeed(new PollExpired())),
  )

  yield* Match.valueTags(result, {
    PollSuccess: (value) =>
      Effect.gen(function* () {
        yield* s.stop("Logged in as " + value.email)
        yield* Prompt.outro("Done")
      }),
    PollExpired: () => s.stop("Device code expired", 1),
    PollDenied: () => s.stop("Authorization denied", 1),
    PollError: (value) => s.stop("Error: " + String(value.cause), 1),
    PollPending: () => s.stop("Unexpected state", 1),
    PollSlow: () => s.stop("Unexpected state", 1),
  })
})

const logoutEffect = Effect.fn("logout")(function* (email?: string) {
  const service = yield* AccountService
  const accounts = yield* service.list()
  if (accounts.length === 0) return yield* println("Not logged in")

  if (email) {
    const match = accounts.find((account) => account.email === email)
    if (!match) return yield* println("Account not found: " + email)
    yield* service.remove(match.id)
    yield* Prompt.outro("Logged out from " + email)
    return
  }

  const active = yield* service.active()
  const activeID = Option.map(active, (account) => account.id)

  yield* Prompt.intro("Log out")

  const opts = accounts.map((account) => {
    const isActive = Option.isSome(activeID) && activeID.value === account.id
    const server = UI.Style.TEXT_DIM + account.url + UI.Style.TEXT_NORMAL
    return {
      value: account,
      label: isActive ? `${account.email} ${server}` + UI.Style.TEXT_DIM + " (active)" : `${account.email} ${server}`,
    }
  })

  const selected = yield* Prompt.select({ message: "Select account to log out", options: opts })
  if (Option.isNone(selected)) return

  yield* service.remove(selected.value.id)
  yield* Prompt.outro("Logged out from " + selected.value.email)
})

interface OrgChoice {
  orgID: OrgID
  accountID: AccountID
  label: string
}

const switchEffect = Effect.fn("switch")(function* () {
  const service = yield* AccountService
  const groups = yield* service.orgsByAccount()
  if (groups.length === 0) return yield* println("Not logged in")

  const active = yield* service.active()
  const activeOrgID = Option.flatMap(active, (account) => Option.fromNullishOr(account.active_org_id))

  const opts = groups.flatMap((group) =>
    group.orgs.map((org) => {
      const isActive = Option.isSome(activeOrgID) && activeOrgID.value === org.id
      return {
        value: { orgID: org.id, accountID: group.account.id, label: org.name },
        label: isActive
          ? `${org.name} (${group.account.email})` + UI.Style.TEXT_DIM + " (active)"
          : `${org.name} (${group.account.email})`,
      }
    }),
  )
  if (opts.length === 0) return yield* println("No orgs found")

  yield* Prompt.intro("Switch org")

  const selected = yield* Prompt.select<OrgChoice>({ message: "Select org", options: opts })
  if (Option.isNone(selected)) return

  yield* service.use(selected.value.accountID, Option.some(selected.value.orgID))
  yield* Prompt.outro("Switched to " + selected.value.label)
})

const orgsEffect = Effect.fn("orgs")(function* () {
  const service = yield* AccountService

  const groups = yield* service.orgsByAccount()
  if (groups.length === 0) return yield* println("No accounts found")
  if (!groups.some((group) => group.orgs.length > 0)) return yield* println("No orgs found")

  const active = yield* service.active()
  const activeOrgID = Option.flatMap(active, (account) => Option.fromNullishOr(account.active_org_id))

  for (const group of groups) {
    for (const org of group.orgs) {
      const isActive = Option.isSome(activeOrgID) && activeOrgID.value === org.id
      const dot = isActive ? UI.Style.TEXT_SUCCESS + "●" + UI.Style.TEXT_NORMAL : " "
      const name = isActive ? UI.Style.TEXT_HIGHLIGHT_BOLD + org.name + UI.Style.TEXT_NORMAL : org.name
      const email = UI.Style.TEXT_DIM + group.account.email + UI.Style.TEXT_NORMAL
      const id = UI.Style.TEXT_DIM + org.id + UI.Style.TEXT_NORMAL
      yield* println(`  ${dot} ${name}  ${email}  ${id}`)
    }
  }
})

export const LoginCommand = cmd({
  command: "login <url>",
  describe: false,
  builder: (yargs) =>
    yargs.positional("url", {
      describe: "server URL",
      type: "string",
      demandOption: true,
    }),
  async handler(args) {
    UI.empty()
    await runtime.runPromise(loginEffect(args.url))
  },
})

export const LogoutCommand = cmd({
  command: "logout [email]",
  describe: false,
  builder: (yargs) =>
    yargs.positional("email", {
      describe: "account email to log out from",
      type: "string",
    }),
  async handler(args) {
    UI.empty()
    await runtime.runPromise(logoutEffect(args.email))
  },
})

export const SwitchCommand = cmd({
  command: "switch",
  describe: false,
  async handler() {
    UI.empty()
    await runtime.runPromise(switchEffect())
  },
})

export const OrgsCommand = cmd({
  command: "orgs",
  describe: false,
  async handler() {
    UI.empty()
    await runtime.runPromise(orgsEffect())
  },
})

export const ConsoleCommand = cmd({
  command: "console",
  describe: false,
  builder: (yargs) =>
    yargs
      .command({
        ...LoginCommand,
        describe: "log in to console",
      })
      .command({
        ...LogoutCommand,
        describe: "log out from console",
      })
      .command({
        ...SwitchCommand,
        describe: "switch active org",
      })
      .command({
        ...OrgsCommand,
        describe: "list orgs",
      })
      .demandCommand(),
  handler() {
    // parent command
  },
})
