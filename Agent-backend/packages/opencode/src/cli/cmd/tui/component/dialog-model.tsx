import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import * as fuzzysort from "fuzzysort"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { createMemo, createSignal } from "solid-js"

import { useKeybind } from "../context/keybind"

import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"

import type { Accessor, JSX } from "solid-js"

export function useConnected(): Accessor<boolean> {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => x.id !== "orbit" || Object.values(x.models).some((y) => y.cost.input !== 0)),
  )
}

export function DialogModel(props: { providerID?: string }): JSX.Element {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const keybind = useKeybind()
  const [query, setQuery] = createSignal("")

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const showExtra = createMemo(() => connected() && !props.providerID)

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = connected() ? local.model.favorite() : []
    const recents = local.model.recent()

    function toOptions(
      items: typeof favorites,
      category: string,
    ): {
      key: (typeof items)[number]
      value: { providerID: string; modelID: string }
      title: string
      description: string
      category: string
      disabled: boolean
      footer: string | undefined
      onSelect: () => void
    }[] {
      if (!showSections) return []
      return items.flatMap((item) => {
        const provider = sync.data.provider.find((x) => x.id === item.providerID)
        if (!provider) return []
        const model = provider.models[item.modelID]
        return [
          {
            key: item,
            value: { providerID: provider.id, modelID: model.id },
            title: model.name,
            description: provider.name,
            category,
            disabled: provider.id === "orbit" && model.id.includes("-nano"),
            footer: model.cost.input === 0 && provider.id === "orbit" ? "Free" : undefined,
            onSelect: () => {
              dialog.clear()
              local.model.set({ providerID: provider.id, modelID: model.id }, { recent: true })
            },
          },
        ]
      })
    }

    const favoriteOptions = toOptions(favorites, "Favorites")
    const recentOptions = toOptions(
      recents.filter(
        (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
      ),
      "Recent",
    )

    const providerOptions = pipe(
      sync.data.provider,
      sortBy(
        (provider) => provider.id !== "orbit",
        (provider) => provider.name,
      ),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => (props.providerID ? info.providerID === props.providerID : true)),
          map(([model, info]) => ({
            value: { providerID: provider.id, modelID: model },
            title: info.name,
            description: favorites.some((item) => item.providerID === provider.id && item.modelID === model)
              ? "(Favorite)"
              : undefined,
            category: connected() ? provider.name : undefined,
            disabled: provider.id === "orbit" && model.includes("-nano"),
            footer: info.cost.input === 0 && provider.id === "orbit" ? "Free" : undefined,
            onSelect() {
              dialog.clear()
              local.model.set({ providerID: provider.id, modelID: model }, { recent: true })
            },
          })),
          filter((x) => {
            if (!showSections) return true
            if (favorites.some((item) => item.providerID === x.value.providerID && item.modelID === x.value.modelID))
              return false
            if (recents.some((item) => item.providerID === x.value.providerID && item.modelID === x.value.modelID))
              return false
            return true
          }),
          sortBy(
            (x) => x.footer !== "Free",
            (x) => x.title,
          ),
        ),
      ),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: "Popular providers",
          })),
          take(6),
        )
      : []

    if (needle) {
      return [
        ...fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj),
        ...fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj),
      ]
    }

    return [...favoriteOptions, ...recentOptions, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((x) => x.id === props.providerID) : null,
  )

  const title = createMemo(() => provider()?.name ?? "Select model")

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
  return (
    <DialogSelect<ReturnType<typeof options>[number]["value"]>
      options={options()}
      keybind={[
        {
          keybind: keybind.all.model_provider_list[0],
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- opentui JSX types
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          keybind: keybind.all.model_favorite_toggle[0],
          title: "Favorite",
          disabled: !connected(),
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      title={title()}
      current={local.model.current()}
    />
  )
}
