/**
 * Safari Timeline Recording Extractor
 *
 * Extracts actionable performance data from a Safari Web Inspector
 * timeline recording JSON (often 200-500MB+) into:
 *   1. A markdown performance report with JS profiler stack traces
 *   2. A trimmed JSON (~10-40MB) with screenshots/heap snapshots stripped
 *
 * Usage: bun run extract-timeline.ts <input.json>
 *
 * Outputs (next to input file):
 *   <input>-report.md     — Human-readable performance report
 *   <input>-trimmed.json  — Re-analyzable JSON without the bloat
 */

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: bun run extract-timeline.ts <recording.json>");
  process.exit(1);
}

const outputReport = inputPath.replace(".json", "-report.md");
const outputTrimmed = inputPath.replace(".json", "-trimmed.json");

console.log(`Reading ${inputPath}...`);
const data = await Bun.file(inputPath).json();
const rec = data.recording;

if (!rec || !rec.records) {
  console.error("Error: Not a valid Safari Timeline recording. Expected { recording: { records: [...] } }");
  process.exit(1);
}

const startTime: number = rec.startTime;
const endTime: number = rec.endTime;
const duration = endTime - startTime;

// ─── Categorize Records ───────────────────────────────────────────

const records: Record<string, Array<Record<string, unknown>>> = {
  script: [],
  layout: [],
  "rendering-frame": [],
  cpu: [],
  memory: [],
  network: [],
};

for (const r of rec.records as Array<Record<string, unknown>>) {
  const type = (r.type as string)?.replace("timeline-record-type-", "");
  if (type && type in records) {
    records[type].push(r);
  }
}

// Print record distribution to console
const recordCounts: Record<string, { count: number; bytes: number }> = {};
for (const r of rec.records as Array<Record<string, unknown>>) {
  const type = (r.type as string)?.replace("timeline-record-type-", "") ?? "unknown";
  if (!recordCounts[type]) recordCounts[type] = { count: 0, bytes: 0 };
  recordCounts[type].count++;
  recordCounts[type].bytes += JSON.stringify(r).length;
}
console.log(`Duration: ${duration.toFixed(2)}s | Records: ${(rec.records as Array<unknown>).length}`);
for (const [type, stats] of Object.entries(recordCounts).sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${type}: ${stats.count} records (${(stats.bytes / 1024 / 1024).toFixed(1)} MB)`);
}

// ─── Script Analysis ──────────────────────────────────────────────

interface ScriptRecord {
  eventType?: string;
  startTime?: number;
  endTime?: number;
  details?: string | { type?: string; url?: string; lineNumber?: number; columnNumber?: number; startTime?: number; endTime?: number };
  extraDetails?: { lineNumber?: number; columnNumber?: number; url?: string } | null;
  children?: ScriptRecord[];
}

function getScriptDuration(r: ScriptRecord): number {
  if (r.startTime != null && r.endTime != null) return (r.endTime - r.startTime) * 1000;
  return 0;
}

function getScriptLocation(r: ScriptRecord): string {
  const extra = r.extraDetails;
  if (extra && typeof extra === "object" && extra.url) {
    const url = extra.url.split("/").slice(-2).join("/");
    return `${url}:${extra.lineNumber ?? "?"}:${extra.columnNumber ?? "?"}`;
  }
  if (typeof r.details === "string" && r.details) return r.details;
  return "";
}

const longScripts = records.script
  .map((r) => {
    const sr = r as unknown as ScriptRecord;
    return {
      eventType: sr.eventType ?? "unknown",
      duration: getScriptDuration(sr),
      location: getScriptLocation(sr),
      startOffset: ((sr.startTime ?? startTime) - startTime).toFixed(3),
    };
  })
  .filter((s) => s.duration > 1)
  .sort((a, b) => b.duration - a.duration);

const scriptEventCounts: Record<string, { count: number; totalMs: number }> = {};
for (const r of records.script) {
  const sr = r as unknown as ScriptRecord;
  const et = sr.eventType ?? "unknown";
  if (!scriptEventCounts[et]) scriptEventCounts[et] = { count: 0, totalMs: 0 };
  scriptEventCounts[et].count++;
  scriptEventCounts[et].totalMs += getScriptDuration(sr);
}

// ─── Layout Analysis ──────────────────────────────────────────────

interface LayoutRecord {
  eventType?: string;
  startTime?: number;
  endTime?: number;
  width?: number;
  height?: number;
}

const layoutEvents = records.layout.map((r) => {
  const lr = r as unknown as LayoutRecord;
  const dur = lr.startTime != null && lr.endTime != null ? (lr.endTime - lr.startTime) * 1000 : 0;
  return {
    eventType: lr.eventType ?? "unknown",
    duration: dur,
    startOffset: ((lr.startTime ?? startTime) - startTime).toFixed(3),
  };
});

const longLayouts = layoutEvents.filter((l) => l.duration > 1).sort((a, b) => b.duration - a.duration);

const layoutTypeCounts: Record<string, { count: number; totalMs: number }> = {};
for (const l of layoutEvents) {
  if (!layoutTypeCounts[l.eventType]) layoutTypeCounts[l.eventType] = { count: 0, totalMs: 0 };
  layoutTypeCounts[l.eventType].count++;
  layoutTypeCounts[l.eventType].totalMs += l.duration;
}

// ─── Frame Analysis ───────────────────────────────────────────────

interface FrameRecord {
  startTime?: number;
  endTime?: number;
}

const renderFrames = records["rendering-frame"].map((r) => {
  const fr = r as unknown as FrameRecord;
  const dur = fr.startTime != null && fr.endTime != null ? (fr.endTime - fr.startTime) * 1000 : 0;
  return {
    duration: dur,
    fps: dur > 0 ? 1000 / dur : 0,
    startOffset: ((fr.startTime ?? startTime) - startTime).toFixed(3),
  };
});

const avgFrameTime = renderFrames.length > 0 ? renderFrames.reduce((s, f) => s + f.duration, 0) / renderFrames.length : 0;
const avgFps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
const droppedFrames = renderFrames.filter((f) => f.duration > 16.67);
const jankFrames = renderFrames.filter((f) => f.duration > 33.33);
const worstFrames = [...renderFrames].sort((a, b) => b.duration - a.duration).slice(0, 20);

// ─── CPU Analysis ─────────────────────────────────────────────────

interface CpuRecord {
  timestamp?: number;
  usage?: number;
  threads?: Array<{ name?: string; usage?: number; type?: string }>;
}

const cpuSamples = records.cpu.map((r) => {
  const cr = r as unknown as CpuRecord;
  const mainThread = cr.threads?.find((t) => t.type === "main");
  return {
    offset: ((cr.timestamp ?? startTime) - startTime).toFixed(3),
    totalUsage: cr.usage ?? 0,
    mainThreadUsage: mainThread?.usage ?? 0,
    topThreads: (cr.threads ?? [])
      .filter((t) => (t.usage ?? 0) > 1)
      .sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0))
      .slice(0, 5)
      .map((t) => `${t.name || "unnamed"}: ${(t.usage ?? 0).toFixed(1)}%`),
  };
});

const highCpuSamples = cpuSamples.filter((s) => s.totalUsage > 50);

// ─── Memory Analysis ──────────────────────────────────────────────

interface MemoryRecord {
  timestamp?: number;
  categories?: Array<{ type?: string; size?: number }>;
}

const memorySamples = records.memory.map((r) => {
  const mr = r as unknown as MemoryRecord;
  const cats: Record<string, number> = {};
  let total = 0;
  for (const c of mr.categories ?? []) {
    const size = c.size ?? 0;
    cats[c.type ?? "unknown"] = size;
    total += size;
  }
  return {
    offset: ((mr.timestamp ?? startTime) - startTime).toFixed(3),
    totalMB: (total / 1024 / 1024).toFixed(1),
    categories: cats,
  };
});

const firstMem = memorySamples[0];
const lastMem = memorySamples[memorySamples.length - 1];
const memGrowthMB = firstMem && lastMem ? (parseFloat(lastMem.totalMB) - parseFloat(firstMem.totalMB)).toFixed(1) : "N/A";

// ─── Network Analysis ─────────────────────────────────────────────

interface NetworkRecord {
  startTime?: number;
  endTime?: number;
  url?: string;
  data?: {
    url?: string;
    method?: string;
    statusCode?: number;
    mimeType?: string;
    responseBodyTransferSize?: number;
    responseBodySize?: number;
    cached?: boolean;
  };
}

const networkRequests = records.network.map((r) => {
  const nr = r as unknown as NetworkRecord;
  const d = nr.data ?? ({} as NonNullable<typeof nr.data>);
  const dur = nr.startTime != null && nr.endTime != null ? (nr.endTime - nr.startTime) * 1000 : 0;
  return {
    url: (d.url ?? nr.url ?? "").replace(/^https?:\/\/[^/]+/, ""),
    method: d.method ?? "GET",
    status: d.statusCode ?? 0,
    duration: dur,
    mimeType: d.mimeType ?? "",
    responseSize: d.responseBodySize ?? d.responseBodyTransferSize ?? 0,
    cached: d.cached ?? false,
    startOffset: ((nr.startTime ?? startTime) - startTime).toFixed(3),
  };
});

const slowRequests = [...networkRequests].sort((a, b) => b.duration - a.duration);

// ─── GC Analysis ──────────────────────────────────────────────────

const gcEvents = records.script.filter(
  (r) => (r as unknown as ScriptRecord).eventType === "garbage-collected"
);
const gcDurations = gcEvents.map((r) => getScriptDuration(r as unknown as ScriptRecord));
const totalGcMs = gcDurations.reduce((s, d) => s + d, 0);
const maxGcMs = gcDurations.length > 0 ? Math.max(...gcDurations) : 0;

// ─── JS Profiler (Stack Traces from recording.samples) ───────────

interface StackFrame {
  sourceID?: string;
  name?: string;
  line?: number;
  column?: number;
  url?: string;
  expressionLocation?: { line?: number; column?: number };
}

interface StackTrace {
  timestamp?: number;
  stackFrames: StackFrame[];
}

interface SampleEntry {
  target?: { identifier?: string; type?: string; name?: string };
  stackTraces: StackTrace[];
  durations: number[];
}

const samplesRaw = rec.samples as SampleEntry[] | undefined;
const pageSample = samplesRaw?.find((s) => s.target?.type === "page");
const hasProfiler = pageSample != null && pageSample.stackTraces.length > 0;

function shortPath(url: string): string {
  if (!url || url === "native") return "native";
  const srcMatch = url.match(/\/src\/(.*)/);
  if (srcMatch) return `src/${srcMatch[1].split("?")[0]}`;
  const depMatch = url.match(/deps\/([^?]+)/);
  if (depMatch) return `deps/${depMatch[1]}`;
  return url.split("/").slice(-2).join("/");
}

const selfTimeByFn: Record<string, number> = {};
const totalTimeByFn: Record<string, number> = {};
const selfTimeByFile: Record<string, number> = {};
const totalTimeByFile: Record<string, number> = {};
const appCodeSelfTime: Record<string, number> = {};
let profilerTotalSampledMs = 0;
let profilerSampleCount = 0;

if (hasProfiler) {
  const { stackTraces, durations: durArr } = pageSample;
  profilerSampleCount = stackTraces.length;
  profilerTotalSampledMs = durArr.reduce((s, d) => s + d, 0) * 1000;

  for (let i = 0; i < stackTraces.length; i++) {
    const st = stackTraces[i];
    const dur = durArr[i]; // seconds
    const stackFrames = st.stackFrames;

    if (stackFrames.length > 0) {
      const leaf = stackFrames[0];
      const leafPath = shortPath(leaf.url ?? "");
      const leafKey = `${leaf.name || "(anonymous)"}  ${leafPath}:${leaf.line ?? "?"}`;
      selfTimeByFn[leafKey] = (selfTimeByFn[leafKey] || 0) + dur;
      if (leafPath !== "native") {
        selfTimeByFile[leafPath] = (selfTimeByFile[leafPath] || 0) + dur;
      }
    }

    const seenFn = new Set<string>();
    const seenFile = new Set<string>();
    let foundAppFrame = false;

    for (const frame of stackFrames) {
      const filePath = shortPath(frame.url ?? "");
      const fnKey = `${frame.name || "(anonymous)"}  ${filePath}:${frame.line ?? "?"}`;

      if (!seenFn.has(fnKey)) {
        seenFn.add(fnKey);
        totalTimeByFn[fnKey] = (totalTimeByFn[fnKey] || 0) + dur;
      }
      if (filePath !== "native" && !seenFile.has(filePath)) {
        seenFile.add(filePath);
        totalTimeByFile[filePath] = (totalTimeByFile[filePath] || 0) + dur;
      }
      if (!foundAppFrame && filePath.startsWith("src/")) {
        foundAppFrame = true;
        const appKey = `${frame.name || "(anonymous)"}  ${filePath}:${frame.line ?? "?"}`;
        appCodeSelfTime[appKey] = (appCodeSelfTime[appKey] || 0) + dur;
      }
    }
  }
}

const selfTimeByFnSorted = Object.entries(selfTimeByFn).sort((a, b) => b[1] - a[1]);
const totalTimeByFnSorted = Object.entries(totalTimeByFn).sort((a, b) => b[1] - a[1]);
const totalTimeByFileSorted = Object.entries(totalTimeByFile).sort((a, b) => b[1] - a[1]);
const appCodeSorted = Object.entries(appCodeSelfTime)
  .filter(([, t]) => t > 0.001)
  .sort((a, b) => b[1] - a[1]);

// ─── Build Report ─────────────────────────────────────────────────

const lines: string[] = [];
const log = (s: string = ""): void => { lines.push(s); };

log("# Timeline Performance Report");
log(`> Recording: ${rec.displayName ?? "Timeline Recording"}`);
log(`> Duration: ${duration.toFixed(2)}s (${startTime.toFixed(3)}s \u2192 ${endTime.toFixed(3)}s)`);
log(`> Generated: ${new Date().toISOString()}`);
log();

// Executive Summary
log("## Executive Summary");
log();
log("| Metric | Value |");
log("| --- | --- |");
log(`| Duration | ${duration.toFixed(2)}s |`);
log(`| Avg FPS | ${avgFps.toFixed(1)} |`);
log(`| Dropped frames (<60fps) | ${droppedFrames.length}/${renderFrames.length} (${((droppedFrames.length / Math.max(renderFrames.length, 1)) * 100).toFixed(0)}%) |`);
log(`| Jank frames (<30fps) | ${jankFrames.length}/${renderFrames.length} |`);
log(`| Worst frame | ${worstFrames[0]?.duration.toFixed(1) ?? "N/A"}ms |`);
log(`| Memory start | ${firstMem?.totalMB ?? "N/A"} MB |`);
log(`| Memory end | ${lastMem?.totalMB ?? "N/A"} MB |`);
log(`| Memory growth | ${memGrowthMB} MB |`);
log(`| GC events | ${gcEvents.length} (${totalGcMs.toFixed(1)}ms total, max ${maxGcMs.toFixed(1)}ms) |`);
log(`| High CPU samples (>50%) | ${highCpuSamples.length}/${cpuSamples.length} |`);
log(`| Script events | ${records.script.length} |`);
log(`| Layout events | ${records.layout.length} |`);
log(`| Network requests | ${networkRequests.length} |`);
if (hasProfiler) {
  log(`| JS profiler samples | ${profilerSampleCount} (${(profilerTotalSampledMs / 1000).toFixed(2)}s sampled) |`);
}
log();

// JS Profiler — the most actionable section
if (hasProfiler) {
  log("## JavaScript Profiler (Stack Traces)");
  log();
  log(`> ${profilerSampleCount} sampling profiler stack traces found in \`recording.samples\`.`);
  log(`> Total sampled CPU time: ${(profilerTotalSampledMs / 1000).toFixed(2)}s.`);
  log();

  log("### Top Functions by SELF TIME (where CPU was actually spent)");
  log();
  log("| Self (ms) | Function | Location |");
  log("| --- | --- | --- |");
  for (const [key, time] of selfTimeByFnSorted.slice(0, 30)) {
    const parts = key.split("  ");
    log(`| ${(time * 1000).toFixed(1)} | \`${parts[0]}\` | ${parts.slice(1).join("  ")} |`);
  }
  log();

  log("### Top Functions by TOTAL TIME (on-stack, including callees)");
  log();
  log("| Total (ms) | Function | Location |");
  log("| --- | --- | --- |");
  for (const [key, time] of totalTimeByFnSorted.slice(0, 30)) {
    const parts = key.split("  ");
    log(`| ${(time * 1000).toFixed(1)} | \`${parts[0]}\` | ${parts.slice(1).join("  ")} |`);
  }
  log();

  log("### CPU Time by Source File");
  log();
  log("| Total (ms) | Self (ms) | File |");
  log("| --- | --- | --- |");
  for (const [file, time] of totalTimeByFileSorted.slice(0, 30)) {
    const self = selfTimeByFile[file] || 0;
    log(`| ${(time * 1000).toFixed(1)} | ${(self * 1000).toFixed(1)} | ${file} |`);
  }
  log();

  if (appCodeSorted.length > 0) {
    log("### Hot App Code (src/ files, self time > 1ms)");
    log();
    log("| Self (ms) | Function | Location |");
    log("| --- | --- | --- |");
    for (const [key, time] of appCodeSorted) {
      const parts = key.split("  ");
      log(`| ${(time * 1000).toFixed(1)} | \`${parts[0]}\` | ${parts.slice(1).join("  ")} |`);
    }
    log();
  }
}

// Frame Analysis
log("## Frame Analysis");
log();
log("### Worst Frames (by duration)");
log();
log("| # | Time (s) | Duration (ms) | Effective FPS |");
log("| --- | --- | --- | --- |");
for (const [i, f] of worstFrames.slice(0, 15).entries()) {
  log(`| ${i + 1} | +${f.startOffset} | ${f.duration.toFixed(1)} | ${f.fps.toFixed(1)} |`);
}
log();

// CPU Analysis
log("## CPU Usage");
log();
if (highCpuSamples.length > 0) {
  log("### High CPU Samples (>50% total)");
  log();
  log("| Time (s) | Total % | Main Thread % | Top Threads |");
  log("| --- | --- | --- | --- |");
  for (const s of highCpuSamples) {
    log(`| +${s.offset} | ${s.totalUsage.toFixed(1)}% | ${s.mainThreadUsage.toFixed(1)}% | ${s.topThreads.join(", ")} |`);
  }
  log();
}

// Memory Analysis
log("## Memory");
log();
log("| Time (s) | Total MB | JavaScript MB | Page MB | JIT MB |");
log("| --- | --- | --- | --- | --- |");
for (const m of memorySamples) {
  const js = ((m.categories["javascript"] ?? 0) / 1024 / 1024).toFixed(1);
  const page = ((m.categories["page"] ?? 0) / 1024 / 1024).toFixed(1);
  const jit = ((m.categories["jit"] ?? 0) / 1024 / 1024).toFixed(1);
  log(`| +${m.offset} | ${m.totalMB} | ${js} | ${page} | ${jit} |`);
}
log();

// GC Events
if (gcEvents.length > 0) {
  log("## Garbage Collection");
  log();
  log(`Total: ${gcEvents.length} events, ${totalGcMs.toFixed(1)}ms combined`);
  log();
  if (maxGcMs > 5) {
    log("### Long GC Pauses (>5ms)");
    log();
    const longGcs = gcEvents
      .map((r) => {
        const sr = r as unknown as ScriptRecord;
        return {
          duration: getScriptDuration(sr),
          offset: ((sr.startTime ?? startTime) - startTime).toFixed(3),
          type: typeof sr.details === "object" ? sr.details?.type : "unknown",
        };
      })
      .filter((g) => g.duration > 5)
      .sort((a, b) => b.duration - a.duration);
    log("| Time (s) | Duration (ms) | Type |");
    log("| --- | --- | --- |");
    for (const g of longGcs) {
      log(`| +${g.offset} | ${g.duration.toFixed(1)} | ${g.type} |`);
    }
    log();
  }
}

// Script Events
log("## Script Event Breakdown");
log();
log("| Event Type | Count | Total Time (ms) | Avg (ms) |");
log("| --- | --- | --- | --- |");
for (const [type, stats] of Object.entries(scriptEventCounts).sort((a, b) => b[1].totalMs - a[1].totalMs)) {
  const avg = stats.count > 0 ? stats.totalMs / stats.count : 0;
  log(`| ${type} | ${stats.count} | ${stats.totalMs.toFixed(1)} | ${avg.toFixed(2)} |`);
}
log();

if (longScripts.length > 0) {
  log("### Longest Script Events (>1ms)");
  log();
  log("| # | Time (s) | Type | Duration (ms) | Location |");
  log("| --- | --- | --- | --- | --- |");
  for (const [i, s] of longScripts.slice(0, 30).entries()) {
    log(`| ${i + 1} | +${s.startOffset} | ${s.eventType} | ${s.duration.toFixed(1)} | ${s.location} |`);
  }
  log();
}

// Layout Events
log("## Layout Event Breakdown");
log();
log("| Event Type | Count | Total Time (ms) | Avg (ms) |");
log("| --- | --- | --- | --- |");
for (const [type, stats] of Object.entries(layoutTypeCounts).sort((a, b) => b[1].totalMs - a[1].totalMs)) {
  const avg = stats.count > 0 ? stats.totalMs / stats.count : 0;
  log(`| ${type} | ${stats.count} | ${stats.totalMs.toFixed(1)} | ${avg.toFixed(2)} |`);
}
log();

if (longLayouts.length > 0) {
  log("### Longest Layout Events (>1ms)");
  log();
  log("| # | Time (s) | Type | Duration (ms) |");
  log("| --- | --- | --- | --- |");
  for (const [i, l] of longLayouts.slice(0, 20).entries()) {
    log(`| ${i + 1} | +${l.startOffset} | ${l.eventType} | ${l.duration.toFixed(1)} |`);
  }
  log();
}

// Network
if (networkRequests.length > 0) {
  log("## Network Requests");
  log();
  log("| # | Time (s) | Method | URL | Status | Duration (ms) | Size |");
  log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const [i, r] of slowRequests.entries()) {
    const size = r.responseSize > 1024 ? `${(r.responseSize / 1024).toFixed(0)}KB` : `${r.responseSize}B`;
    const urlShort = r.url.length > 60 ? r.url.slice(0, 57) + "..." : r.url;
    log(`| ${i + 1} | +${r.startOffset} | ${r.method} | ${urlShort} | ${r.status} | ${r.duration.toFixed(0)} | ${size} |`);
  }
  log();
}

// ─── Write Outputs ────────────────────────────────────────────────

const report = lines.join("\n");
await Bun.write(outputReport, report);
console.log(`\nReport: ${outputReport}`);

// Trimmed JSON — strip screenshots and heap allocations (the two biggest)
const trimmedRecords = rec.records.filter((r: Record<string, unknown>) => {
  const type = r.type as string;
  return type !== "timeline-record-type-screenshots" && type !== "timeline-record-type-heap-allocations";
});

const trimmed = {
  version: data.version,
  recording: {
    displayName: rec.displayName,
    startTime: rec.startTime,
    endTime: rec.endTime,
    instrumentTypes: rec.instrumentTypes,
    recordCount: {
      original: (rec.records as Array<unknown>).length,
      trimmed: trimmedRecords.length,
      removed: {
        screenshots: (rec.records as Array<Record<string, unknown>>).filter((r) => r.type === "timeline-record-type-screenshots").length,
        heapAllocations: (rec.records as Array<Record<string, unknown>>).filter((r) => r.type === "timeline-record-type-heap-allocations").length,
      },
    },
    records: trimmedRecords,
    ...(rec.samples ? { samples: rec.samples } : {}),
    ...(rec.markers ? { markers: rec.markers } : {}),
    ...(rec.memoryPressureEvents ? { memoryPressureEvents: rec.memoryPressureEvents } : {}),
  },
  ...(data.overview ? { overview: data.overview } : {}),
};

await Bun.write(outputTrimmed, JSON.stringify(trimmed, null, 2));
const trimmedSize = Bun.file(outputTrimmed).size;
console.log(`Trimmed: ${outputTrimmed} (${(trimmedSize / 1024 / 1024).toFixed(1)} MB)`);
console.log("Done!");
