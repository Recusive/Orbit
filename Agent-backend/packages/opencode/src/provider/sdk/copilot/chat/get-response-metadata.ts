export function getResponseMetadata({
  id,
  model,
  created,
}: {
  id?: string | undefined | null
  created?: number | undefined | null
  model?: string | undefined | null
}): { id: string | undefined; modelId: string | undefined; timestamp: Date | undefined } {
  return {
    id: id ?? undefined,
    modelId: model ?? undefined,
    timestamp: created !== null && created !== undefined ? new Date(created * 1000) : undefined,
  }
}
