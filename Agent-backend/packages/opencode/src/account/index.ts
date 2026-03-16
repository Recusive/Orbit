import { Option } from "effect"

import { Account as AccountSchema, AccountService } from "./service"

import type { AccountError, AccessToken, AccountID, OrgID } from "./service"
import type { Effect } from "effect"

import { runtime } from "@/effect/runtime"

export { AccessToken, AccountID, OrgID } from "./service"

function runSync<A>(f: (service: AccountService.Service) => Effect.Effect<A, AccountError>): A {
  return runtime.runSync(AccountService.use(f))
}

function runPromise<A>(f: (service: AccountService.Service) => Effect.Effect<A, AccountError>): Promise<A> {
  return runtime.runPromise(AccountService.use(f))
}

export namespace Account {
  export const Account = AccountSchema
  export type Account = AccountSchema

  export function active(): Account | undefined {
    return Option.getOrUndefined(runSync((service) => service.active()))
  }

  export async function config(accountID: AccountID, orgID: OrgID): Promise<Record<string, unknown> | undefined> {
    return Option.getOrUndefined(await runPromise((service) => service.config(accountID, orgID)))
  }

  export async function token(accountID: AccountID): Promise<AccessToken | undefined> {
    return Option.getOrUndefined(await runPromise((service) => service.token(accountID)))
  }
}
