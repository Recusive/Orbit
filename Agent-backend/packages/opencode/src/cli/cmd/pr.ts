import { UI } from "../ui"

import { cmd } from "./cmd"

import { Instance } from "@/project/instance"
import { git } from "@/util/git"
import { Process } from "@/util/process"

interface PrInfo {
  isCrossRepository?: boolean
  headRepository?: { name: string }
  headRepositoryOwner?: { login: string }
  headRefName?: string
  body?: string
}

export const PrCommand = cmd({
  command: "pr <number>",
  describe: "fetch and checkout a GitHub PR branch, then run orbit",
  builder: (yargs) =>
    yargs.positional("number", {
      type: "number",
      describe: "PR number to checkout",
      demandOption: true,
    }),
  async handler(args) {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const project = Instance.project
        if (project.vcs !== "git") {
          UI.error("Could not find git repository. Please run this command from a git repository.")
          process.exit(1)
        }

        const prNumber = args.number
        const localBranchName = `pr/${String(prNumber)}`
        UI.println(`Fetching and checking out PR #${String(prNumber)}...`)

        // Use gh pr checkout with custom branch name
        const result = await Process.run(
          ["gh", "pr", "checkout", String(prNumber), "--branch", localBranchName, "--force"],
          {
            nothrow: true,
          },
        )

        if (result.code !== 0) {
          UI.error(`Failed to checkout PR #${String(prNumber)}. Make sure you have gh CLI installed and authenticated.`)
          process.exit(1)
        }

        // Fetch PR info for fork handling and session link detection
        const prInfoResult = await Process.text(
          [
            "gh",
            "pr",
            "view",
            String(prNumber),
            "--json",
            "headRepository,headRepositoryOwner,isCrossRepository,headRefName,body",
          ],
          { nothrow: true },
        )

        let sessionId: string | undefined

        if (prInfoResult.code === 0) {
          const prInfoText = prInfoResult.text
          if (prInfoText.trim()) {
            const prInfo = JSON.parse(prInfoText) as PrInfo

            // Handle fork PRs
            if (prInfo.isCrossRepository === true && prInfo.headRepository && prInfo.headRepositoryOwner) {
              const forkOwner = prInfo.headRepositoryOwner.login
              const forkName = prInfo.headRepository.name
              const remoteName = forkOwner

              // Check if remote already exists
              const remotes = (await git(["remote"], { cwd: Instance.worktree })).text().trim()
              if (!remotes.split("\n").includes(remoteName)) {
                await git(["remote", "add", remoteName, `https://github.com/${forkOwner}/${forkName}.git`], {
                  cwd: Instance.worktree,
                })
                UI.println(`Added fork remote: ${remoteName}`)
              }

              // Set upstream to the fork so pushes go there
              const headRefName = prInfo.headRefName
              await git(["branch", `--set-upstream-to=${remoteName}/${String(headRefName)}`, localBranchName], {
                cwd: Instance.worktree,
              })
            }

            // Check for opencode session link in PR body
            if (typeof prInfo.body === "string" && prInfo.body.length > 0) {
              const sessionMatch = /https:\/\/opncd\.ai\/s\/([a-zA-Z0-9_-]+)/.exec(prInfo.body)
              if (sessionMatch) {
                const sessionUrl: string = sessionMatch[0]
                UI.println(`Found orbit session: ${sessionUrl}`)
                UI.println(`Importing session...`)

                const importResult = await Process.text(["orbit", "import", sessionUrl], {
                  nothrow: true,
                })
                if (importResult.code === 0) {
                  const importOutput = importResult.text.trim()
                  // Extract session ID from the output (format: "Imported session: <session-id>")
                  const sessionIdMatch = /Imported session: ([a-zA-Z0-9_-]+)/.exec(importOutput)
                  if (sessionIdMatch) {
                    sessionId = sessionIdMatch[1]
                    UI.println(`Session imported: ${sessionId}`)
                  }
                }
              }
            }
          }
        }

        UI.println(`Successfully checked out PR #${String(prNumber)} as branch '${localBranchName}'`)
        UI.println()
        UI.println("Starting orbit...")
        UI.println()

        // Launch opencode TUI with session ID if available
        const { spawn } = await import("child_process")
        const opencodeArgs = sessionId ? ["-s", sessionId] : []
        const opencodeProcess = spawn("orbit", opencodeArgs, {
          stdio: "inherit",
          cwd: process.cwd(),
        })

        await new Promise<void>((resolve, reject) => {
          opencodeProcess.on("exit", (code) => {
            if (code === 0) resolve()
            else reject(new Error(`orbit exited with code ${String(code)}`))
          })
          opencodeProcess.on("error", reject)
        })
      },
    })
  },
})
