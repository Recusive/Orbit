import os from "os"
import path from "path"


// Direct imports for bundled providers
import { createAmazonBedrock  } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createCerebras } from "@ai-sdk/cerebras"
import { createCohere } from "@ai-sdk/cohere"
import { createDeepInfra } from "@ai-sdk/deepinfra"
import { createGateway } from "@ai-sdk/gateway"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"
import { createGroq } from "@ai-sdk/groq"
import { createMistral } from "@ai-sdk/mistral"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createVercel } from "@ai-sdk/vercel"
import { createXai } from "@ai-sdk/xai"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import { createGitLab, VERSION as GITLAB_PROVIDER_VERSION } from "@gitlab/gitlab-ai-provider"
import { NamedError } from "@opencode-ai/util/error"
import { createOpenRouter  } from "@openrouter/ai-sdk-provider"
import { NoSuchModelError  } from "ai"
import fuzzysort from "fuzzysort"
import { GoogleAuth } from "google-auth-library"
import { mapValues, mergeDeep, omit, pickBy, sortBy } from "remeda"
import z from "zod"

import { Auth } from "../auth"
import { BunProc } from "../bun"
import { Config } from "../config/config"
import { Env } from "../env"
import { Flag } from "../flag/flag"
import { Global } from "../global"
import { Installation } from "../installation"
import { Plugin } from "../plugin"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { Hash } from "../util/hash"
import { Log } from "../util/log"

import { ModelsDev } from "./models"
import { createOpenaiCompatible as createGitHubCopilotOpenAICompatible } from "./sdk/copilot"
import { ProviderTransform } from "./transform"

import type {AmazonBedrockProviderSettings} from "@ai-sdk/amazon-bedrock";
import type {LanguageModelV2} from "@openrouter/ai-sdk-provider";
import type {Provider as SDK} from "ai";

import { iife } from "@/util/iife"

/**
 * Extended SDK interface for providers that support chat/responses in addition to languageModel.
 * OpenAI, Azure, and Copilot providers expose these extra methods.
 */
interface ExtendedSDK extends SDK {
  chat?: (modelId: string) => LanguageModelV2
  responses?: (modelId: string) => LanguageModelV2
}

/**
 * SAP AI Core SDK is callable as a function directly.
 */
type SapSDK = ((modelId: string) => LanguageModelV2) & SDK

export namespace Provider {
  const log = Log.create({ service: "provider" })

  function isGpt5OrLater(modelID: string): boolean {
    const match = /^gpt-(\d+)/.exec(modelID)
    if (!match) {
      return false
    }
    return Number(match[1]) >= 5
  }

  function shouldUseCopilotResponsesApi(modelID: string): boolean {
    return isGpt5OrLater(modelID) && !modelID.startsWith("gpt-5-mini")
  }

  function googleVertexVars(options: Record<string, unknown>): {
    GOOGLE_VERTEX_PROJECT: unknown
    GOOGLE_VERTEX_LOCATION: unknown
    GOOGLE_VERTEX_ENDPOINT: string
  } {
    const project =
      (options.project as string | undefined) ?? Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
    const location =
      (options.location as string | undefined) ?? Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-central1"
    const endpoint = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`

    return {
      GOOGLE_VERTEX_PROJECT: project,
      GOOGLE_VERTEX_LOCATION: location,
      GOOGLE_VERTEX_ENDPOINT: endpoint,
    }
  }

  function loadBaseURL(model: Model, options: Record<string, unknown>): unknown {
    const raw = (options.baseURL as string | undefined) ?? model.api.url
    if (typeof raw !== "string" || raw === "") return raw === "" ? undefined : raw
    const vars = model.providerID === "google-vertex" ? googleVertexVars(options) : undefined
    return raw.replace(/\$\{([^}]+)\}/g, (match, key: string) => {
      const val = Env.get(key) ?? (vars !== undefined ? vars[key as keyof typeof vars] : undefined)
      return typeof val === "string" ? val : match
    })
  }

  // Use a broader type for the bundled providers map since each create* function
  // returns its own specific provider type (OpenAIProvider, AzureOpenAIProvider, etc.)
  // that extends ProviderV2 but isn't exactly SDK (Provider from 'ai').
  const BUNDLED_PROVIDERS: Record<string, (options: Record<string, unknown>) => unknown> = {
    "@ai-sdk/amazon-bedrock": createAmazonBedrock as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/anthropic": createAnthropic as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/azure": createAzure as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/google": createGoogleGenerativeAI as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/google-vertex": createVertex as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/google-vertex/anthropic": createVertexAnthropic as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/openai": createOpenAI as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/openai-compatible": createOpenAICompatible as unknown as (options: Record<string, unknown>) => unknown,
    "@openrouter/ai-sdk-provider": createOpenRouter as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/xai": createXai as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/mistral": createMistral as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/groq": createGroq as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/deepinfra": createDeepInfra as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/cerebras": createCerebras as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/cohere": createCohere as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/gateway": createGateway as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/togetherai": createTogetherAI as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/perplexity": createPerplexity as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/vercel": createVercel as (options: Record<string, unknown>) => unknown,
    "@gitlab/gitlab-ai-provider": createGitLab as (options: Record<string, unknown>) => unknown,
    "@ai-sdk/github-copilot": createGitHubCopilotOpenAICompatible as (options: Record<string, unknown>) => unknown,
  }

  type CustomModelLoader = (sdk: ExtendedSDK, modelID: string, options?: Record<string, unknown>) => LanguageModelV2 | Promise<LanguageModelV2>
  type CustomLoader = (provider: Info) => Promise<{
    autoload: boolean
    getModel?: CustomModelLoader
    options?: Record<string, unknown>
  }>

  const CUSTOM_LOADERS: Record<string, CustomLoader> = {
    anthropic() {
      return Promise.resolve({
        autoload: false,
        options: {
          headers: {
            "anthropic-beta":
              "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
          },
        },
      })
    },
    async opencode(input) {
      const hasKey = await (async (): Promise<boolean> => {
        const env = Env.all()
        if (input.env.some((item) => env[item] !== undefined && env[item] !== "")) return true
        if (await Auth.get(input.id)) return true
        const config = await Config.get()
        if (config.provider?.opencode.options?.apiKey !== undefined) return true
        return false
      })()

      if (!hasKey) {
        for (const [key, value] of Object.entries(input.models)) {
          if (value.cost.input === 0) continue
          const models = input.models
          delete models[key] // eslint-disable-line @typescript-eslint/no-dynamic-delete
        }
      }

      return {
        autoload: Object.keys(input.models).length > 0,
        options: hasKey ? {} : { apiKey: "public" },
      }
    },
    openai() {
      return Promise.resolve({
        autoload: false,
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          if (sdk.responses !== undefined) {
            return sdk.responses(modelID)
          }
          return sdk.languageModel(modelID) as LanguageModelV2
        },
        options: {},
      })
    },
    "github-copilot"() {
      return Promise.resolve({
        autoload: false,
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(modelID) as LanguageModelV2
          return shouldUseCopilotResponsesApi(modelID)
            ? (sdk.responses !== undefined ? sdk.responses(modelID) : sdk.languageModel(modelID) as LanguageModelV2)
            : (sdk.chat !== undefined ? sdk.chat(modelID) : sdk.languageModel(modelID) as LanguageModelV2)
        },
        options: {},
      })
    },
    "github-copilot-enterprise"() {
      return Promise.resolve({
        autoload: false,
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(modelID) as LanguageModelV2
          return shouldUseCopilotResponsesApi(modelID)
            ? (sdk.responses !== undefined ? sdk.responses(modelID) : sdk.languageModel(modelID) as LanguageModelV2)
            : (sdk.chat !== undefined ? sdk.chat(modelID) : sdk.languageModel(modelID) as LanguageModelV2)
        },
        options: {},
      })
    },
    azure() {
      return Promise.resolve({
        autoload: false,
        getModel(sdk: ExtendedSDK, modelID: string, options?: Record<string, unknown>): LanguageModelV2 {
          if (options?.useCompletionUrls === true) {
            return sdk.chat !== undefined ? sdk.chat(modelID) : sdk.languageModel(modelID) as LanguageModelV2
          } else {
            return sdk.responses !== undefined ? sdk.responses(modelID) : sdk.languageModel(modelID) as LanguageModelV2
          }
        },
        options: {},
      })
    },
    "azure-cognitive-services"() {
      const resourceName = Env.get("AZURE_COGNITIVE_SERVICES_RESOURCE_NAME")
      return Promise.resolve({
        autoload: false,
        getModel(sdk: ExtendedSDK, modelID: string, options?: Record<string, unknown>): LanguageModelV2 {
          if (options?.useCompletionUrls === true) {
            return sdk.chat !== undefined ? sdk.chat(modelID) : sdk.languageModel(modelID) as LanguageModelV2
          } else {
            return sdk.responses !== undefined ? sdk.responses(modelID) : sdk.languageModel(modelID) as LanguageModelV2
          }
        },
        options: {
          baseURL: resourceName !== undefined ? `https://${resourceName}.cognitiveservices.azure.com/openai` : undefined,
        },
      })
    },
    async "amazon-bedrock"() {
      const config = await Config.get()
      const providerConfig = config.provider?.["amazon-bedrock"]

      const auth = await Auth.get("amazon-bedrock")

      // Region precedence: 1) config file, 2) env var, 3) default
      const configRegion = providerConfig?.options?.region as string | undefined
      const envRegion = Env.get("AWS_REGION")
      const defaultRegion = configRegion ?? envRegion ?? "us-east-1"

      // Profile: config file takes precedence over env var
      const configProfile = providerConfig?.options?.profile as string | undefined
      const envProfile = Env.get("AWS_PROFILE")
      const profile = configProfile ?? envProfile

      const awsAccessKeyId = Env.get("AWS_ACCESS_KEY_ID")

      // TODO: Using process.env directly because Env.set only updates a process.env shallow copy,
      // until the scope of the Env API is clarified (test only or runtime?)
      const awsBearerToken = iife((): string | undefined => {
        const envToken = process.env.AWS_BEARER_TOKEN_BEDROCK
        if (envToken !== undefined && envToken !== "") return envToken
        if (auth?.type === "api") {
          process.env.AWS_BEARER_TOKEN_BEDROCK = auth.key
          return auth.key
        }
        return undefined
      })

      const awsWebIdentityTokenFile = Env.get("AWS_WEB_IDENTITY_TOKEN_FILE")

      const containerCreds = Boolean(
        process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ?? process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI,
      )

      if (profile === undefined && awsAccessKeyId === undefined && awsBearerToken === undefined && awsWebIdentityTokenFile === undefined && !containerCreds)
        return { autoload: false }

      const providerOptions: AmazonBedrockProviderSettings = {
        region: defaultRegion,
      }

      // Only use credential chain if no bearer token exists
      // Bearer token takes precedence over credential chain (profiles, access keys, IAM roles, web identity tokens)
      if (awsBearerToken === undefined) {
        // Build credential provider options (only pass profile if specified)
        const credentialProviderOptions = profile !== undefined ? { profile } : {}

        providerOptions.credentialProvider = fromNodeProviderChain(credentialProviderOptions)
      }

      // Add custom endpoint if specified (endpoint takes precedence over baseURL)
      const endpoint = (providerConfig?.options?.endpoint ?? providerConfig?.options?.baseURL) as string | undefined
      if (endpoint !== undefined) {
        providerOptions.baseURL = endpoint
      }

      return {
        autoload: true,
        options: providerOptions as Record<string, unknown>,
        getModel(sdk: ExtendedSDK, modelID: string, options?: Record<string, unknown>): LanguageModelV2 {
          // Skip region prefixing if model already has a cross-region inference profile prefix
          // Models from models.dev may already include prefixes like us., eu., global., etc.
          const crossRegionPrefixes = ["global.", "us.", "eu.", "jp.", "apac.", "au."]
          if (crossRegionPrefixes.some((prefix) => modelID.startsWith(prefix))) {
            return sdk.languageModel(modelID) as LanguageModelV2
          }

          // Region resolution precedence (highest to lowest):
          // 1. options.region from opencode.json provider config
          // 2. defaultRegion from AWS_REGION environment variable
          // 3. Default "us-east-1" (baked into defaultRegion)
          const region = (options?.region as string | undefined) ?? defaultRegion

          let regionPrefix = region.split("-")[0]
          let prefixedModelID = modelID

          switch (regionPrefix) {
            case "us": {
              const modelRequiresPrefix = [
                "nova-micro",
                "nova-lite",
                "nova-pro",
                "nova-premier",
                "nova-2",
                "claude",
                "deepseek",
              ].some((m) => modelID.includes(m))
              const isGovCloud = region.startsWith("us-gov")
              if (modelRequiresPrefix && !isGovCloud) {
                prefixedModelID = `${regionPrefix}.${modelID}`
              }
              break
            }
            case "eu": {
              const regionRequiresPrefix = [
                "eu-west-1",
                "eu-west-2",
                "eu-west-3",
                "eu-north-1",
                "eu-central-1",
                "eu-south-1",
                "eu-south-2",
              ].some((r) => region.includes(r))
              const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "llama3", "pixtral"].some((m) =>
                modelID.includes(m),
              )
              if (regionRequiresPrefix && modelRequiresPrefix) {
                prefixedModelID = `${regionPrefix}.${modelID}`
              }
              break
            }
            case "ap": {
              const isAustraliaRegion = ["ap-southeast-2", "ap-southeast-4"].includes(region)
              const isTokyoRegion = region === "ap-northeast-1"
              if (
                isAustraliaRegion &&
                ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku"].some((m) => modelID.includes(m))
              ) {
                regionPrefix = "au"
                prefixedModelID = `${regionPrefix}.${modelID}`
              } else if (isTokyoRegion) {
                // Tokyo region uses jp. prefix for cross-region inference
                const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                  modelID.includes(m),
                )
                if (modelRequiresPrefix) {
                  regionPrefix = "jp"
                  prefixedModelID = `${regionPrefix}.${modelID}`
                }
              } else {
                // Other APAC regions use apac. prefix
                const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                  modelID.includes(m),
                )
                if (modelRequiresPrefix) {
                  regionPrefix = "apac"
                  prefixedModelID = `${regionPrefix}.${modelID}`
                }
              }
              break
            }
          }

          return sdk.languageModel(prefixedModelID) as LanguageModelV2
        },
      }
    },
    openrouter() {
      return Promise.resolve({
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      })
    },
    vercel() {
      return Promise.resolve({
        autoload: false,
        options: {
          headers: {
            "http-referer": "https://opencode.ai/",
            "x-title": "opencode",
          },
        },
      })
    },
    "google-vertex"(provider) {
      const project =
        (provider.options.project as string | undefined) ??
        Env.get("GOOGLE_CLOUD_PROJECT") ??
        Env.get("GCP_PROJECT") ??
        Env.get("GCLOUD_PROJECT")

      const location =
        (provider.options.location as string | undefined) ?? Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-central1"

      const autoload = project !== undefined && project !== ""
      if (!autoload) return Promise.resolve({ autoload: false })
      return Promise.resolve({
        autoload: true,
        options: {
          project,
          location,
          fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const auth = new GoogleAuth()
            const client = await auth.getApplicationDefault()
            const token = await client.credential.getAccessToken()

            const headers = new Headers(init?.headers)
            headers.set("Authorization", `Bearer ${token.token ?? ""}`)

            return fetch(input, { ...init, headers })
          },
        },
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          return sdk.languageModel(modelID.trim()) as LanguageModelV2
        },
      })
    },
    "google-vertex-anthropic"() {
      const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
      const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "global"
      const autoload = project !== undefined && project !== ""
      if (!autoload) return Promise.resolve({ autoload: false })
      return Promise.resolve({
        autoload: true,
        options: {
          project,
          location,
        },
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          return sdk.languageModel(modelID.trim()) as LanguageModelV2
        },
      })
    },
    async "sap-ai-core"() {
      const auth = await Auth.get("sap-ai-core")
      // TODO: Using process.env directly because Env.set only updates a shallow copy (not process.env),
      // until the scope of the Env API is clarified (test only or runtime?)
      const envServiceKey = iife((): string | undefined => {
        const envAICoreServiceKey = process.env.AICORE_SERVICE_KEY
        if (envAICoreServiceKey !== undefined && envAICoreServiceKey !== "") return envAICoreServiceKey
        if (auth?.type === "api") {
          process.env.AICORE_SERVICE_KEY = auth.key
          return auth.key
        }
        return undefined
      })
      const deploymentId = process.env.AICORE_DEPLOYMENT_ID
      const resourceGroup = process.env.AICORE_RESOURCE_GROUP

      return {
        autoload: envServiceKey !== undefined,
        options: envServiceKey !== undefined ? { deploymentId, resourceGroup } : {},
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          // SAP AI Core SDK is callable directly as a function
          return (sdk as unknown as SapSDK)(modelID)
        },
      }
    },
    zenmux() {
      return Promise.resolve({
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      })
    },
    async gitlab(input) {
      const instanceUrl = Env.get("GITLAB_INSTANCE_URL") ?? "https://gitlab.com"

      const auth = await Auth.get(input.id)
      const apiKey = iife((): string | undefined => {
        if (auth?.type === "oauth") return auth.access
        if (auth?.type === "api") return auth.key
        return Env.get("GITLAB_TOKEN")
      })

      const config = await Config.get()
      const providerConfig = config.provider?.gitlab

      const aiGatewayHeaders: Record<string, string> = {
        "User-Agent": `opencode/${Installation.VERSION} gitlab-ai-provider/${GITLAB_PROVIDER_VERSION} (${os.platform()} ${os.release()}; ${os.arch()})`,
        "anthropic-beta": "context-1m-2025-08-07",
        ...((providerConfig?.options?.aiGatewayHeaders as Record<string, string> | undefined) ?? {}),
      }

      return {
        autoload: apiKey !== undefined,
        options: {
          instanceUrl,
          apiKey,
          aiGatewayHeaders,
          featureFlags: {
            duo_agent_platform_agentic_chat: true,
            duo_agent_platform: true,
            ...((providerConfig?.options?.featureFlags as Record<string, boolean> | undefined) ?? {}),
          },
        },
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          const gitlabSdk = sdk as unknown as ReturnType<typeof createGitLab>
          return gitlabSdk.agenticChat(modelID, {
            aiGatewayHeaders,
            featureFlags: {
              duo_agent_platform_agentic_chat: true,
              duo_agent_platform: true,
              ...((providerConfig?.options?.featureFlags as Record<string, boolean> | undefined) ?? {}),
            },
          })
        },
      }
    },
    async "cloudflare-workers-ai"(input) {
      const accountId = Env.get("CLOUDFLARE_ACCOUNT_ID")
      if (accountId === undefined) return { autoload: false }

      const apiKey = await iife(async (): Promise<string | undefined> => {
        const envToken = Env.get("CLOUDFLARE_API_KEY")
        if (envToken !== undefined) return envToken
        const auth = await Auth.get(input.id)
        if (auth?.type === "api") return auth.key
        return undefined
      })

      return {
        autoload: apiKey !== undefined,
        options: {
          apiKey,
          baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
        },
        getModel(sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          return sdk.languageModel(modelID) as LanguageModelV2
        },
      }
    },
    async "cloudflare-ai-gateway"(input) {
      const accountId = Env.get("CLOUDFLARE_ACCOUNT_ID")
      const gateway = Env.get("CLOUDFLARE_GATEWAY_ID")

      if (accountId === undefined || gateway === undefined) return { autoload: false }

      // Get API token from env or auth - required for authenticated gateways
      const apiToken = await (async (): Promise<string | undefined> => {
        const envToken = Env.get("CLOUDFLARE_API_TOKEN") ?? Env.get("CF_AIG_TOKEN")
        if (envToken !== undefined) return envToken
        const auth = await Auth.get(input.id)
        if (auth?.type === "api") return auth.key
        return undefined
      })()

      if (apiToken === undefined) {
        throw new Error(
          "CLOUDFLARE_API_TOKEN (or CF_AIG_TOKEN) is required for Cloudflare AI Gateway. " +
            "Set it via environment variable or run `orbit auth cloudflare-ai-gateway`.",
        )
      }

      // Use official ai-gateway-provider package (v2.x for AI SDK v5 compatibility)
      const { createAiGateway } = await import("ai-gateway-provider")
      const { createUnified } = await import("ai-gateway-provider/providers/unified")

      const metadata = iife((): unknown => {
        if (input.options.metadata !== undefined) return input.options.metadata as unknown
        try {
          const headerVal = (input.options.headers as Record<string, string> | undefined)?.["cf-aig-metadata"]
          if (headerVal !== undefined) {
            return JSON.parse(headerVal) as unknown
          }
          return undefined
        } catch {
          return undefined
        }
      })
      const opts = {
        metadata: metadata as Record<string, number | string | boolean | null | bigint> | undefined,
        cacheTtl: input.options.cacheTtl as number | undefined,
        cacheKey: input.options.cacheKey as string | undefined,
        skipCache: input.options.skipCache as boolean | undefined,
        collectLog: input.options.collectLog as boolean | undefined,
      }

      const aigateway = createAiGateway({
        accountId,
        gateway,
        apiKey: apiToken,
        ...(Object.values(opts).some((v) => v !== undefined) ? { options: opts } : {}),
      })
      const unified = createUnified()

      return {
        autoload: true,
        getModel(_sdk: ExtendedSDK, modelID: string): LanguageModelV2 {
          // Model IDs use Unified API format: provider/model (e.g., "anthropic/claude-sonnet-4-5")
          return aigateway(unified(modelID))
        },
        options: {},
      }
    },
    cerebras() {
      return Promise.resolve({
        autoload: false,
        options: {
          headers: {
            "X-Cerebras-3rd-Party-Integration": "opencode",
          },
        },
      })
    },
    kilo() {
      return Promise.resolve({
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      })
    },
  }

  export const Model = z
    .object({
      id: z.string(),
      providerID: z.string(),
      api: z.object({
        id: z.string(),
        url: z.string(),
        npm: z.string(),
      }),
      name: z.string(),
      family: z.string().optional(),
      capabilities: z.object({
        temperature: z.boolean(),
        reasoning: z.boolean(),
        attachment: z.boolean(),
        toolcall: z.boolean(),
        input: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        output: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        interleaved: z.union([
          z.boolean(),
          z.object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          }),
        ]),
      }),
      cost: z.object({
        input: z.number(),
        output: z.number(),
        cache: z.object({
          read: z.number(),
          write: z.number(),
        }),
        experimentalOver200K: z
          .object({
            input: z.number(),
            output: z.number(),
            cache: z.object({
              read: z.number(),
              write: z.number(),
            }),
          })
          .optional(),
      }),
      limit: z.object({
        context: z.number(),
        input: z.number().optional(),
        output: z.number(),
      }),
      status: z.enum(["alpha", "beta", "deprecated", "active"]),
      options: z.record(z.string(), z.any()),
      headers: z.record(z.string(), z.string()),
      release_date: z.string(),
      variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
    })
    .meta({
      ref: "Model",
    })
  export type Model = z.infer<typeof Model>

  export const Info = z
    .object({
      id: z.string(),
      name: z.string(),
      source: z.enum(["env", "config", "custom", "api"]),
      env: z.string().array(),
      key: z.string().optional(),
      options: z.record(z.string(), z.any()),
      models: z.record(z.string(), Model),
    })
    .meta({
      ref: "Provider",
    })
  export type Info = z.infer<typeof Info>

  function fromModelsDevModel(provider: ModelsDev.Provider, model: ModelsDev.Model): Model {
    const m: Model = {
      id: model.id,
      providerID: provider.id,
      name: model.name,
      family: model.family,
      api: {
        id: model.id,
        url: model.provider?.api ?? provider.api ?? "",
        npm: model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible",
      },
      status: model.status ?? "active",
      headers: model.headers ?? {},
      options: model.options,
      cost: {
        input: model.cost?.input ?? 0,
        output: model.cost?.output ?? 0,
        cache: {
          read: model.cost?.cache_read ?? 0,
          write: model.cost?.cache_write ?? 0,
        },
        experimentalOver200K: model.cost?.context_over_200k
          ? {
              cache: {
                read: model.cost.context_over_200k.cache_read ?? 0,
                write: model.cost.context_over_200k.cache_write ?? 0,
              },
              input: model.cost.context_over_200k.input,
              output: model.cost.context_over_200k.output,
            }
          : undefined,
      },
      limit: {
        context: model.limit.context,
        input: model.limit.input,
        output: model.limit.output,
      },
      capabilities: {
        temperature: model.temperature,
        reasoning: model.reasoning,
        attachment: model.attachment,
        toolcall: model.tool_call,
        input: {
          text: model.modalities?.input.includes("text") ?? false,
          audio: model.modalities?.input.includes("audio") ?? false,
          image: model.modalities?.input.includes("image") ?? false,
          video: model.modalities?.input.includes("video") ?? false,
          pdf: model.modalities?.input.includes("pdf") ?? false,
        },
        output: {
          text: model.modalities?.output.includes("text") ?? false,
          audio: model.modalities?.output.includes("audio") ?? false,
          image: model.modalities?.output.includes("image") ?? false,
          video: model.modalities?.output.includes("video") ?? false,
          pdf: model.modalities?.output.includes("pdf") ?? false,
        },
        interleaved: model.interleaved ?? false,
      },
      release_date: model.release_date,
      variants: {},
    }

    m.variants = mapValues(ProviderTransform.variants(m), (v) => v)

    return m
  }

  export function fromModelsDevProvider(provider: ModelsDev.Provider): Info {
    return {
      id: provider.id,
      source: "custom",
      name: provider.name,
      env: provider.env,
      options: {},
      models: mapValues(provider.models, (model) => fromModelsDevModel(provider, model)),
    }
  }

  const state = Instance.state(async () => {
    using _ = log.time("state")
    const config = await Config.get()
    const modelsDev = await ModelsDev.get()
    const database = mapValues(modelsDev, fromModelsDevProvider)

    const disabled = new Set(config.disabled_providers ?? [])
    const enabled = config.enabled_providers ? new Set(config.enabled_providers) : null

    function isProviderAllowed(providerID: string): boolean {
      if (enabled !== null && !enabled.has(providerID)) return false
      if (disabled.has(providerID)) return false
      return true
    }

    const providers: Record<string, Info> = {}
    const languages = new Map<string, LanguageModelV2>()
    const modelLoaders: Record<string, CustomModelLoader> = {}
    const sdkMap = new Map<string, SDK>()

    log.info("init")

    const configProviders = Object.entries(config.provider ?? {})

    // Add GitHub Copilot Enterprise provider that inherits from GitHub Copilot
    if ("github-copilot" in database) {
      const githubCopilot = database["github-copilot"]
      database["github-copilot-enterprise"] = {
        ...githubCopilot,
        id: "github-copilot-enterprise",
        name: "GitHub Copilot Enterprise",
        models: mapValues(githubCopilot.models, (model) => ({
          ...model,
          providerID: "github-copilot-enterprise",
        })),
      }
    }

    function mergeProvider(providerID: string, provider: Partial<Info>): void {
      if (providerID in providers) {
        providers[providerID] = mergeDeep(providers[providerID], provider) as Info
        return
      }
      if (providerID in database) {
        providers[providerID] = mergeDeep(database[providerID], provider) as Info
      }
    }

    // extend database from config
    for (const [providerID, provider] of configProviders) {
      const existing = database[providerID]
      const parsed: Info = {
        id: providerID,
        name: provider.name ?? existing.name,
        env: provider.env ?? existing.env,
        options: mergeDeep(existing.options, provider.options ?? {}),
        source: "config",
        models: existing.models,
      }

      for (const [modelID, model] of Object.entries(provider.models ?? {})) {
        const existingModel = parsed.models[model.id ?? modelID]
        const name = iife((): string => {
          if (model.name !== undefined) return model.name
          if (model.id !== undefined && model.id !== modelID) return modelID
          return existingModel.name
        })
        const parsedModel: Model = {
          id: modelID,
          api: {
            id: model.id ?? existingModel.api.id,
            npm:
              model.provider?.npm ??
              provider.npm ??
              existingModel.api.npm,
            url: model.provider?.api ?? provider.api ?? existingModel.api.url,
          },
          status: model.status ?? existingModel.status,
          name,
          providerID,
          capabilities: {
            temperature: model.temperature ?? existingModel.capabilities.temperature,
            reasoning: model.reasoning ?? existingModel.capabilities.reasoning,
            attachment: model.attachment ?? existingModel.capabilities.attachment,
            toolcall: model.tool_call ?? existingModel.capabilities.toolcall,
            input: {
              text: model.modalities?.input.includes("text") ?? existingModel.capabilities.input.text,
              audio: model.modalities?.input.includes("audio") ?? existingModel.capabilities.input.audio,
              image: model.modalities?.input.includes("image") ?? existingModel.capabilities.input.image,
              video: model.modalities?.input.includes("video") ?? existingModel.capabilities.input.video,
              pdf: model.modalities?.input.includes("pdf") ?? existingModel.capabilities.input.pdf,
            },
            output: {
              text: model.modalities?.output.includes("text") ?? existingModel.capabilities.output.text,
              audio: model.modalities?.output.includes("audio") ?? existingModel.capabilities.output.audio,
              image: model.modalities?.output.includes("image") ?? existingModel.capabilities.output.image,
              video: model.modalities?.output.includes("video") ?? existingModel.capabilities.output.video,
              pdf: model.modalities?.output.includes("pdf") ?? existingModel.capabilities.output.pdf,
            },
            interleaved: model.interleaved ?? false,
          },
          cost: {
            input: model.cost?.input ?? existingModel.cost.input,
            output: model.cost?.output ?? existingModel.cost.output,
            cache: {
              read: model.cost?.cache_read ?? existingModel.cost.cache.read,
              write: model.cost?.cache_write ?? existingModel.cost.cache.write,
            },
          },
          options: mergeDeep(existingModel.options, model.options ?? {}),
          limit: {
            context: model.limit?.context ?? existingModel.limit.context,
            output: model.limit?.output ?? existingModel.limit.output,
          },
          headers: mergeDeep(existingModel.headers, model.headers ?? {}),
          family: model.family ?? existingModel.family ?? "",
          release_date: model.release_date ?? existingModel.release_date,
          variants: {},
        }
        const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {})
        parsedModel.variants = mapValues(
          pickBy(merged, (v) => (v as Record<string, unknown>).disabled !== true),
          (v) => omit(v as Record<string, unknown> & { disabled?: unknown }, ["disabled"]),
        )
        parsed.models[modelID] = parsedModel
      }
      database[providerID] = parsed
    }

    // load env
    const env = Env.all()
    for (const [providerID, provider] of Object.entries(database)) {
      if (disabled.has(providerID)) continue
      const apiKey = provider.env.map((item) => env[item]).find((val): val is string => val !== undefined && val !== "")
      if (apiKey === undefined) continue
      mergeProvider(providerID, {
        source: "env",
        key: provider.env.length === 1 ? apiKey : undefined,
      })
    }

    // load apikeys
    for (const [providerID, provider] of Object.entries(await Auth.all())) {
      if (disabled.has(providerID)) continue
      if (provider.type === "api") {
        mergeProvider(providerID, {
          source: "api",
          key: provider.key,
        })
      }
    }

    for (const plugin of await Plugin.list()) {
      if (plugin.auth === undefined) continue
      const providerID = plugin.auth.provider
      if (disabled.has(providerID)) continue

      // For github-copilot plugin, check if auth exists for either github-copilot or github-copilot-enterprise
      let hasAuth = false
      const auth = await Auth.get(providerID)
      if (auth !== undefined) hasAuth = true

      // Special handling for github-copilot: also check for enterprise auth
      if (providerID === "github-copilot" && !hasAuth) {
        const enterpriseAuth = await Auth.get("github-copilot-enterprise")
        if (enterpriseAuth !== undefined) hasAuth = true
      }

      if (!hasAuth) continue
      if (plugin.auth.loader === undefined) continue

      // Load for the main provider if auth exists
      if (auth !== undefined) {
        const options = await plugin.auth.loader(
          () => Auth.get(providerID) as Promise<Auth.Info>,
          database[plugin.auth.provider],
        )
        const patch: Partial<Info> = providerID in providers ? { options } : { source: "custom", options }
        mergeProvider(providerID, patch)
      }

      // If this is github-copilot plugin, also register for github-copilot-enterprise if auth exists
      if (providerID === "github-copilot") {
        const enterpriseProviderID = "github-copilot-enterprise"
        if (!disabled.has(enterpriseProviderID)) {
          const enterpriseAuth = await Auth.get(enterpriseProviderID)
          if (enterpriseAuth !== undefined) {
            const enterpriseOptions = await plugin.auth.loader(
              () => Auth.get(enterpriseProviderID) as Promise<Auth.Info>,
              database[enterpriseProviderID],
            )
            const patch: Partial<Info> = enterpriseProviderID in providers
              ? { options: enterpriseOptions }
              : { source: "custom", options: enterpriseOptions }
            mergeProvider(enterpriseProviderID, patch)
          }
        }
      }
    }

    for (const [providerID, fn] of Object.entries(CUSTOM_LOADERS)) {
      if (disabled.has(providerID)) continue
      if (!(providerID in database)) {
        log.error("Provider does not exist in model list " + providerID)
        continue
      }
      const data = database[providerID]
      const result = await fn(data)
      if (result.autoload || providerID in providers) {
        if (result.getModel !== undefined) modelLoaders[providerID] = result.getModel
        const opts = result.options ?? {}
        const patch: Partial<Info> = providerID in providers ? { options: opts } : { source: "custom", options: opts }
        mergeProvider(providerID, patch)
      }
    }

    // load config
    for (const [providerID, provider] of configProviders) {
      const partial: Partial<Info> = { source: "config" }
      if (provider.env !== undefined) partial.env = provider.env
      if (provider.name !== undefined) partial.name = provider.name
      if (provider.options !== undefined) partial.options = provider.options
      mergeProvider(providerID, partial)
    }

    for (const [providerID, provider] of Object.entries(providers)) {
      if (!isProviderAllowed(providerID)) {
        const providerRecord = providers
        delete providerRecord[providerID] // eslint-disable-line @typescript-eslint/no-dynamic-delete
        continue
      }

      const configProvider = config.provider?.[providerID]

      for (const [modelID, model] of Object.entries(provider.models)) {
        const modelRecord = provider.models
        if (modelID === "gpt-5-chat-latest" || (providerID === "openrouter" && modelID === "openai/gpt-5-chat"))
          delete modelRecord[modelID] // eslint-disable-line @typescript-eslint/no-dynamic-delete
        if (model.status === "alpha" && !Flag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS) delete modelRecord[modelID] // eslint-disable-line @typescript-eslint/no-dynamic-delete
        if (model.status === "deprecated") delete modelRecord[modelID] // eslint-disable-line @typescript-eslint/no-dynamic-delete
        if (
          (configProvider?.blacklist?.includes(modelID) === true) ||
          (configProvider?.whitelist !== undefined && !configProvider.whitelist.includes(modelID))
        )
          delete modelRecord[modelID] // eslint-disable-line @typescript-eslint/no-dynamic-delete

        model.variants = mapValues(ProviderTransform.variants(model), (v) => v)

        // Filter out disabled variants from config
        const configVariants = configProvider?.models?.[modelID]?.variants
        if (configVariants !== undefined) {
          const merged = mergeDeep(model.variants, configVariants)
          model.variants = mapValues(
            pickBy(merged, (v) => (v as Record<string, unknown>).disabled !== true),
            (v) => omit(v as Record<string, unknown> & { disabled?: unknown }, ["disabled"]),
          )
        }
      }

      if (Object.keys(provider.models).length === 0) {
        const providerRecord = providers
        delete providerRecord[providerID] // eslint-disable-line @typescript-eslint/no-dynamic-delete
        continue
      }

      log.info("found", { providerID })
    }

    return {
      models: languages,
      providers,
      sdk: sdkMap,
      modelLoaders,
    }
  })

  export async function list(): Promise<Record<string, Info>> {
    return state().then((state) => state.providers)
  }

  /**
   * Invalidates the cached provider state so the next `list()` call
   * re-reads auth.json and rebuilds the provider map from scratch.
   * Called after any auth mutation (API key save, OAuth callback, auth removal).
   */
  export function reset(): void {
    state.reset()
  }

  async function getSDK(model: Model): Promise<SDK> {
    try {
      using _ = log.time("getSDK", {
        providerID: model.providerID,
      })
      const s = await state()
      const provider = s.providers[model.providerID]
      const options: Record<string, unknown> = { ...provider.options }

      if (model.providerID === "google-vertex" && !model.api.npm.includes("@ai-sdk/openai-compatible")) {
        const optRecord = options
        delete optRecord.fetch  
      }

      if (model.api.npm.includes("@ai-sdk/openai-compatible") && options.includeUsage !== false) {
        options.includeUsage = true
      }

      const baseURL = loadBaseURL(model, options)
      if (baseURL !== undefined) options.baseURL = baseURL
      if (options.apiKey === undefined && provider.key !== undefined) options.apiKey = provider.key
      if (Object.keys(model.headers).length > 0)
        options.headers = {
          ...(options.headers as Record<string, string> | undefined),
          ...model.headers,
        }

      const key = Hash.fast(JSON.stringify({ providerID: model.providerID, npm: model.api.npm, options }))
      const existing = s.sdk.get(key)
      if (existing !== undefined) return existing

      const customFetch = options.fetch as ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined

      options.fetch = async (input: RequestInfo | URL, init?: BunFetchRequestInit): Promise<Response> => {
        // Preserve custom fetch if it exists, wrap it with timeout logic
        const fetchFn = customFetch ?? fetch
        const opts: BunFetchRequestInit = init ?? {}

        if (options.timeout !== undefined && options.timeout !== null) {
          const signals: AbortSignal[] = []
          if (opts.signal !== undefined && opts.signal !== null) signals.push(opts.signal)
          if (options.timeout !== false) signals.push(AbortSignal.timeout(options.timeout as number))

          const combined = signals.length > 1 ? AbortSignal.any(signals) : signals[0]

          opts.signal = combined
        }

        // Strip openai itemId metadata following what codex does
        // Codex uses #[serde(skip_serializing)] on id fields for all item types:
        // Message, Reasoning, FunctionCall, LocalShellCall, CustomToolCall, WebSearchCall
        // IDs are only re-attached for Azure with store=true
        if (model.api.npm === "@ai-sdk/openai" && opts.body !== undefined && opts.method === "POST") {
          const body = JSON.parse(opts.body as string) as Record<string, unknown>
          const isAzure = model.providerID.includes("azure")
          const keepIds = isAzure && body.store === true
          if (!keepIds && Array.isArray(body.input)) {
            for (const item of body.input as Record<string, unknown>[]) {
              if ("id" in item) {
                delete (item).id  
              }
            }
            opts.body = JSON.stringify(body)
          }
        }

        return fetchFn(input, {
          ...opts,
          // Bun-specific: disable fetch timeout (see: https://github.com/oven-sh/bun/issues/16682)
          timeout: false as unknown as number,
        } as RequestInit)
      }

      if (model.api.npm in BUNDLED_PROVIDERS) {
        const bundledFn = BUNDLED_PROVIDERS[model.api.npm]
        log.info("using bundled provider", { providerID: model.providerID, pkg: model.api.npm })
        const loaded = bundledFn({
          name: model.providerID,
          ...options,
        }) as SDK
        s.sdk.set(key, loaded)
        return loaded
      }

      let installedPath: string
      if (!model.api.npm.startsWith("file://")) {
        installedPath = await BunProc.install(model.api.npm, "latest")
      } else {
        log.info("loading local provider", { pkg: model.api.npm })
        installedPath = model.api.npm
      }

      const mod = await import(installedPath) as Record<string, unknown>

      const createKey = Object.keys(mod).find((k) => k.startsWith("create"))
      if (createKey === undefined) {
        throw new Error(`No create* function found in module ${model.api.npm}`)
      }
      const fn = mod[createKey] as (options: Record<string, unknown>) => SDK
      const loaded = fn({
        name: model.providerID,
        ...options,
      })
      s.sdk.set(key, loaded)
      return loaded
    } catch (e: unknown) {
      throw new InitError({ providerID: model.providerID }, { cause: e })
    }
  }

  export async function getProvider(providerID: string): Promise<Info | undefined> {
    return state().then((s) => s.providers[providerID])
  }

  export async function getModel(providerID: string, modelID: string): Promise<Model> {
    const s = await state()
    if (!(providerID in s.providers)) {
      const availableProviders = Object.keys(s.providers)
      const matches = fuzzysort.go(providerID, availableProviders, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }
    const provider = s.providers[providerID]

    if (!(modelID in provider.models)) {
      const availableModels = Object.keys(provider.models)
      const matches = fuzzysort.go(modelID, availableModels, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }
    return provider.models[modelID]
  }

  export async function getLanguage(model: Model): Promise<LanguageModelV2> {
    const s = await state()
    const key = `${model.providerID}/${model.id}`
    const cached = s.models.get(key)
    if (cached !== undefined) return cached

    const provider = s.providers[model.providerID]
    const sdk = await getSDK(model)

    try {
      const language = (model.providerID in s.modelLoaders
        ? await s.modelLoaders[model.providerID](sdk as ExtendedSDK, model.api.id, provider.options as Record<string, unknown>)
        : sdk.languageModel(model.api.id)) as LanguageModelV2
      s.models.set(key, language)
      return language
    } catch (e: unknown) {
      if (e instanceof NoSuchModelError)
        throw new ModelNotFoundError(
          {
            modelID: model.id,
            providerID: model.providerID,
          },
          { cause: e },
        )
      throw e
    }
  }

  export async function closest(providerID: string, query: string[]): Promise<{ providerID: string; modelID: string } | undefined> {
    const s = await state()
    if (!(providerID in s.providers)) return undefined
    const provider = s.providers[providerID]
    for (const item of query) {
      for (const modelID of Object.keys(provider.models)) {
        if (modelID.includes(item))
          return {
            providerID,
            modelID,
          }
      }
    }
    return undefined
  }

  export async function getSmallModel(providerID: string): Promise<Model | undefined> {
    const cfg = await Config.get()

    if (cfg.small_model !== undefined) {
      const parsed = parseModel(cfg.small_model)
      return getModel(parsed.providerID, parsed.modelID)
    }

    const s = await state()
    if (providerID in s.providers) {
      const provider = s.providers[providerID]
      let priority = [
        "claude-haiku-4-5",
        "claude-haiku-4.5",
        "3-5-haiku",
        "3.5-haiku",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gpt-5-nano",
      ]
      if (providerID.startsWith("opencode")) {
        priority = ["gpt-5-nano"]
      }
      if (providerID.startsWith("github-copilot")) {
        // prioritize free models for github copilot
        priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority]
      }
      for (const item of priority) {
        if (providerID === "amazon-bedrock") {
          const crossRegionPrefixes = ["global.", "us.", "eu."]
          const candidates = Object.keys(provider.models).filter((m) => m.includes(item))

          // Model selection priority:
          // 1. global. prefix (works everywhere)
          // 2. User's region prefix (us., eu.)
          // 3. Unprefixed model
          const globalMatch = candidates.find((m) => m.startsWith("global."))
          if (globalMatch !== undefined) return getModel(providerID, globalMatch)

          const region = provider.options.region as string | undefined
          if (region !== undefined) {
            const regionPrefix = region.split("-")[0]
            if (regionPrefix === "us" || regionPrefix === "eu") {
              const regionalMatch = candidates.find((m) => m.startsWith(`${regionPrefix}.`))
              if (regionalMatch !== undefined) return getModel(providerID, regionalMatch)
            }
          }

          const unprefixed = candidates.find((m) => !crossRegionPrefixes.some((p) => m.startsWith(p)))
          if (unprefixed !== undefined) return getModel(providerID, unprefixed)
        } else {
          for (const model of Object.keys(provider.models)) {
            if (model.includes(item)) return getModel(providerID, model)
          }
        }
      }
    }

    return undefined
  }

  const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
  export function sort(models: Model[]): Model[] {
    return sortBy(
      models,
      [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
      [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
      [(model) => model.id, "desc"],
    )
  }

  export async function defaultModel(): Promise<{ providerID: string; modelID: string }> {
    const cfg = await Config.get()
    if (cfg.model !== undefined) return parseModel(cfg.model)

    const providers = await list()
    const recent = (await Filesystem.readJson<{ recent?: { providerID: string; modelID: string }[] }>(
      path.join(Global.Path.state, "model.json"),
    )
      .then((x) => (Array.isArray(x.recent) ? x.recent : []))
      .catch(() => [])) as { providerID: string; modelID: string }[]
    for (const entry of recent) {
      if (!(entry.providerID in providers)) continue
      const provider = providers[entry.providerID]
      if (!(entry.modelID in provider.models)) continue
      return { providerID: entry.providerID, modelID: entry.modelID }
    }

    const provider = Object.values(providers).find((p) => cfg.provider === undefined || Object.keys(cfg.provider).includes(p.id))
    if (provider === undefined) throw new Error("no providers found")
    const sorted = sort(Object.values(provider.models))
    if (sorted.length === 0) throw new Error("no models found")
    const model = sorted[0]
    return {
      providerID: provider.id,
      modelID: model.id,
    }
  }

  export function parseModel(model: string): { providerID: string; modelID: string } {
    const [providerID, ...rest] = model.split("/")
    return {
      providerID: providerID,
      modelID: rest.join("/"),
    }
  }

  export const ModelNotFoundError = NamedError.create(
    "ProviderModelNotFoundError",
    z.object({
      providerID: z.string(),
      modelID: z.string(),
      suggestions: z.array(z.string()).optional(),
    }),
  )

  export const InitError = NamedError.create(
    "ProviderInitError",
    z.object({
      providerID: z.string(),
    }),
  )
}
