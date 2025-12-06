# Agents Guide for Waidrin

## TL;DR
- Next.js 15 app router frontend (`app/`, `components/`, `views/`) drives an async LLM-powered RPG engine living in `lib/`.
- The story state machine in `lib/engine.ts` mutates a persisted Zustand store (`lib/state.ts`) and validates everything with shared zod schemas before/after every turn.
- Always use Bun for dependency management and scripts (`bun install`, `bun run ...`); do not mix npm/pnpm/yarn in this repo.
- Run `bun install` then `bun run dev` and point the Connection step at an OpenAI-compatible server (e.g., `llama.cpp` HTTP server). Prod parity is `bun run build && bun run start`.
- Plugins load dynamically from `/plugins` (configurable via `PLUGINS_DIR`). Each manifest can ship custom settings, backends, and UI via the `Context` helper.
- Keep AGPL headers, double quotes, Biome formatting, and run `bun run lint` (or `bunx biome check`) before committing.

## Environment & Tooling
- Requirements: Bun 1.1+ (script runner + package manager), Node 20+ (Next runtime), Git, a running OpenAI-compatible inference server. Default state points at `http://localhost:8080/v1/` with empty credentials.
- Install deps once with `bun install`. Run `bun run dev` for Turbopack hot reload, or `bun run build && bun run start` to mimic production.
- LLM configuration happens through the in-app Connection step (apiUrl, apiKey, model, context lengths, sampling params). Values persist in browser storage via Zustand; clear them via the Main Menu → Reset or `localStorage.removeItem("state")`.
- Logs (`logPrompts`, `logParams`, `logResponses`) live inside the persisted state and are exposed via the State Debugger for ad-hoc tracing.
- Tooling: Next.js + TypeScript, Radix UI, Tailwind (global styles only), Zustand+Immer, Biome for lint/format, and Next's built-in ESLint via `bun run lint`.

## Repo Tour
- `app/`: App Router entry point (`page.tsx`) that orchestrates overlays, error handling, view switching, and plugin bootstrapping.
- `components/`: Shared UI primitives (event renderers, menus, overlays, debugger, etc.). These are mostly pure presentational components.
- `views/`: High-level wizard steps for each phase of the experience (Welcome, Connection, Genre, Character, Scenario, Chat).
- `lib/`: Core engine logic: prompts, schemas, backend abstraction, state store, token-budgeted context builder, etc.
- `plugins/`: Runtime-loaded plugin bundles. Git ignores everything under `plugins/*` except the tracked `demo-plugin` so agents can drop local builds safely.
- `public/`: Static imagery for genres, avatars, icons.
- Root configs: `next.config.ts`, `tsconfig.json`, `biome.json`, `postcss.config.mjs`, plus standard Node/Next metadata.

## Runtime Architecture & Data Flow
The heart of the project is the async `next()` state machine, which advances the user through the onboarding wizard and the ongoing chat loop while continuously validating state against shared schemas:
```121:244:lib/engine.ts
      if (state.view === "welcome") {
        state.view = "connection";
      } else if (state.view === "connection") {
        step = ["Checking connection", "If this takes longer than a few seconds, there is probably something wrong"];
        const testObject = await backend.getObject({ system: "test", user: "test" }, z.literal("waidrin"), onToken);
        if (testObject !== "waidrin") {
          throw new Error("Backend does not support schema constraints");
        }

        state.view = "genre";
      } else if (state.view === "genre") {
        state.view = "character";
      } else if (state.view === "character") {
        step = ["Generating world", "This typically takes between 10 and 30 seconds"];
        state.world = await backend.getObject(generateWorldPrompt, schemas.World, onToken);
        // ...
        state.actions = await backend.getObject(
          generateActionsPrompt(state),
          schemas.Action.array().length(3),
          onToken,
        );
```
- Every branch calls `schemas.State.parse(state)` before and after mutation, ensuring the UI never renders invalid structures.
- Generated events are appended immediately so the UI can stream updates via throttled Zustand writes.
- `lib/context.ts` compresses accumulated narration/location events into a token-budgeted summary before each LLM call, so expansions stay within the configured context window.

State lives in a persisted Zustand store that merges narrative fields with plugin/back-end metadata:
```29:70:lib/state.ts
export const initialState: State = schemas.State.parse({
  apiUrl: "http://localhost:8080/v1/",
  apiKey: "",
  model: "",
  contextLength: 16384,
  inputLength: 16384,
  generationParams: {
    temperature: 0.5,
  },
  narrationParams: {
    temperature: 0.6,
    min_p: 0.03,
    dry_multiplier: 0.8,
  },
  updateInterval: 200,
  logPrompts: false,
  logParams: false,
  logResponses: false,
  view: "welcome",
  world: {
    name: "[name]",
    description: "[description]",
  },
  locations: [],
  characters: [],
  protagonist: {
    name: "[name]",
    gender: "male",
    race: "human",
    biography: "[biography]",
    locationIndex: 0,
  },
  hiddenDestiny: false,
  betrayal: false,
  oppositeSexMagnet: false,
  sameSexMagnet: false,
  sexualContentLevel: "regular",
  violentContentLevel: "regular",
  events: [],
  actions: [],
});
```
- `useStateStore` wraps Zustand with Immer and a `Mutex`-guarded `setAsync` so long-running engine steps cannot interleave with manual edits (see `setAsync` in the same file).
- Persister strips functions/backends before writing to IndexedDB/localStorage so rehydration stays deterministic.

## Working with Backends
- `lib/backend.ts` defines the default OpenAI-compatible backend. `DefaultBackend.getObject` enforces JSON schema responses so hallucinated shapes fail fast.
- Plugins can register additional backends (e.g., a llama.cpp controller with custom settings) and select them by writing to `state.activeBackend`.
- Abort semantics rely on `AbortController`; always call `abort()` via the UI overlay cancel hook to unwind streaming calls cleanly.
- When debugging LLM traffic, toggle `logPrompts`/`logResponses` in the State Debugger to emit raw traffic in the browser console.

## Plugins & Extension Points
Plugins are plain JS modules discovered at runtime by the `/app/plugins/route.ts` API, which scans the `PLUGINS_DIR` directory for `manifest.json` files:
```18:38:app/plugins/route.ts
const PLUGINS_DIR = process.env.PLUGINS_DIR || path.join(process.cwd(), "plugins");

export async function GET() {
  try {
    const manifests: Manifest[] = [];
    const manifestFiles = await glob("*/manifest.json", { cwd: PLUGINS_DIR });

    for (const manifestFile of manifestFiles) {
      const manifestContent = await readFile(path.join(PLUGINS_DIR, manifestFile), "utf-8");
      const manifest: Manifest = JSON.parse(manifestContent);
      manifest.path = path.dirname(manifestFile);
      manifests.push(manifest);
    }

    return NextResponse.json(manifests);
  } catch (error) {
    console.error(error);
    return NextResponse.json({}, { status: 500 });
  }
}
```
- Each manifest exposes `name`, `main`, and default `settings`. The app dynamically imports `/plugins/${manifest.path}/${manifest.main}` with `webpackIgnore` so bundles can be authored however you like (Vite, tsup, etc.) as long as they produce browser-ready modules.
- Plugins implement any subset of `init`, `getBackends`, and `onLocationChange`. Use the provided `Context` helper to persist per-plugin settings or render backend configuration UIs inside the app:
```35:64:app/plugins.ts
export class Context {
  pluginName: string;

  constructor(pluginName: string) {
    this.pluginName = pluginName;
  }

  saveSettings(settings: Record<string, unknown>): void {
    getState().set((state) => {
      for (const plugin of state.plugins) {
        if (plugin.name === this.pluginName) {
          plugin.settings = settings;
          return;
        }
      }

      throw new Error(`No settings object found for plugin ${this.pluginName}`);
    });
  }

  addBackendUI(backendName: string, configurationTab: React.ReactNode, configurationPage: React.ReactNode): void {
    getPluginsState().set((state) => {
      state.backendUIs.push({
        backendName,
        configurationTab,
        configurationPage,
      });
    });
  }
}
```
- Keep plugin bundles small—only enabled plugins load. Disabled entries persist in the store but skip the module import to avoid unnecessary network work.
- The sample `plugins/demo-plugin` logs location changes; reference it when scaffolding new hooks.

## UI Flow & Debugging
- `MainMenu` (helmet icon, top-left) opens issue reporting and exposes a hard reset that wipes all persisted state.
- `StateDebugger` (eye icon, top-right) renders the entire store via `@microlink/react-json-view` with read/write toggles. It strips functions/backends so editing is safe.
- `ProcessingOverlay` displays streaming status, token counts, and binds cancel to `abort()` while LLM calls are in flight.
- `ErrorPopup` centralizes retry/cancel flows; prefer reusing it rather than ad-hoc toasts.
- During story mode, use the debugger to inspect `events`, `locations`, and `actions` to ensure prompts or plugin hooks produce the expected structures.

## Quality & Conventions
- Biome enforces double quotes, 120-char lines, and auto import organization. Run `bunx biome check --apply` (or rely on editor integration) before sending patches.
- `bun run lint` executes Next/ESLint; fix warnings before merging to keep CI green.
- UI strings should remain human-friendly and accessible; rely on Radix primitives and keep imagery references in `public/images`.
- Avoid mutating Zustand state directly—always go through `useStateStore` helpers so Immer can track drafts.

## Common Agent Workflows
- **Debug a backend issue:** Enable the State Debugger, toggle logging flags, reproduce the failing step, inspect `console` output, and confirm the backend is returning JSON that satisfies the target zod schema.
- **Add a prompt or schema tweak:** Update `lib/prompts.ts`/`lib/schemas.ts`, adjust `lib/engine.ts` call sites, and verify the flow by running through the relevant wizard steps. Remember to regenerate any derived types.
- **Build a plugin:** Scaffold `plugins/my-plugin/{manifest.json,main.ts}`; export class with optional hooks, and use `Context` to save settings or register UI. Point `PLUGINS_DIR` at your workspace if you want to develop outside the repo root.
- **Reset corrupted state:** Use Main Menu → Reset or clear the persisted `state` key in devtools, then reload the page to step through the wizard from scratch.

## Reference Commands
- `bun run dev` — Next.js dev server with Turbopack + React Strict Mode.
- `bun run build` — Production build (must succeed before PRs).
- `bun run start` — Serve the production build.
- `bun run lint` — Next/ESLint (uses project tsconfig).
- `bunx biome check --write .` — Optional formatter/linter pass matching repo defaults.
- `LLAMA_SERVER --host 0.0.0.0 --api-key XXX ...` — Ensure an OpenAI-compatible endpoint is alive before using the Connection step.
