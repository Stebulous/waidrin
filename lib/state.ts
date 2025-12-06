// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { Mutex } from "async-mutex";
import { createDraft, finishDraft, type WritableDraft } from "immer";
import type * as z from "zod/v4";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { Backend } from "./backend";
import * as schemas from "./schemas";

export type View = z.infer<typeof schemas.View>;
export type World = z.infer<typeof schemas.World>;
export type Gender = z.infer<typeof schemas.Gender>;
export type Race = z.infer<typeof schemas.Race>;
export type Character = z.infer<typeof schemas.Character>;
export type LocationType = z.infer<typeof schemas.LocationType>;
export type Location = z.infer<typeof schemas.Location>;
export type SexualContentLevel = z.infer<typeof schemas.SexualContentLevel>;
export type ViolentContentLevel = z.infer<typeof schemas.ViolentContentLevel>;
export type ActionEvent = z.infer<typeof schemas.ActionEvent>;
export type NarrationEvent = z.infer<typeof schemas.NarrationEvent>;
export type CharacterIntroductionEvent = z.infer<typeof schemas.CharacterIntroductionEvent>;
export type LocationChangeEvent = z.infer<typeof schemas.LocationChangeEvent>;
export type Event = z.infer<typeof schemas.Event>;
export type EventHistoryEntry = z.infer<typeof schemas.EventHistoryEntry>;
export type EventHistory = z.infer<typeof schemas.EventHistory>;
export type State = z.infer<typeof schemas.State>;

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
  eventHistory: {},
  historyPagination: undefined,
});

export type Plugin = Partial<{
  // The context is determined by the environment in which the plugin runs,
  // e.g. a frontend that provides methods for adding custom components.
  init(settings: Record<string, unknown>, context: unknown): Promise<void>;

  getBackends(): Promise<Record<string, Backend>>;

  onLocationChange(newLocation: Location, state: WritableDraft<State>): Promise<void>;
}>;

export interface PluginWrapper {
  name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  plugin: Plugin;
}

export interface Plugins {
  plugins: PluginWrapper[];
  backends: Record<string, Backend>;
  activeBackend: string;
}

export interface Actions {
  set: (
    nextStateOrUpdater: StoredState | Partial<StoredState> | ((state: WritableDraft<StoredState>) => void),
    shouldReplace?: false,
  ) => void;
  setAsync: (updater: (state: WritableDraft<StoredState>) => Promise<void>) => Promise<void>;
}

export type StoredState = State & Plugins & Actions;

const setAsyncMutex = new Mutex();

export const useStateStore = create<StoredState>()(
  persist(
    immer((set, get) => ({
      ...initialState,
      plugins: [],
      backends: {},
      activeBackend: "default",
      set: set,
      setAsync: async (updater) => {
        await setAsyncMutex.runExclusive(async () => {
          // According to https://immerjs.github.io/immer/async/, this is an "anti-pattern", because
          // "updates [...] that happen during the async process, would be "missed" by the draft".
          // However, for our use case, this is actually exactly what we want, because it prevents
          // manual updates during state machine operations from producing inconsistent states.
          const state = get();
          const draft = createDraft(state);

          try {
            await updater(draft);
          } catch (error) {
            // Roll back any changes the updater may have written to the state store.
            set(state);
            // Re-throw the error to be handled by higher-level logic.
            throw error;
          }

          const newState = finishDraft(draft);
          set(newState);
        });
      },
    })),
    {
      name: "state",
      partialize: (state) => {
        // Don't persist functions and class instances.
        const persistedState: Partial<StoredState> = { ...state };

        persistedState.plugins = state.plugins.map((plugin) => {
          const persistedPlugin: Partial<PluginWrapper> = { ...plugin };
          delete persistedPlugin.plugin;
          return persistedPlugin as PluginWrapper;
        });

        delete persistedState.backends;
        delete persistedState.set;
        delete persistedState.setAsync;

        return persistedState;
      },
    },
  ),
);

export function getState(): StoredState {
  return useStateStore.getState();
}

/**
 * Initialize history for an event if it doesn't exist
 */
export function ensureEventHistory(eventIndex: number): void {
  if (eventIndex < 0) {
    return;
  }
  getState().set((state) => {
    const key = String(eventIndex);
    if (!state.eventHistory) {
      state.eventHistory = {};
    }
    if (!state.eventHistory[key]) {
      const event = state.events[eventIndex];
      if (event) {
        state.eventHistory[key] = {
          entries: [
            {
              event: { ...event },
              timestamp: Date.now(),
              type: event.type === "action" ? "edit" : "regenerate",
            },
          ],
          currentVersionIndex: 0,
        };
      }
    }
  });
}

/**
 * Add a new version to an event's history
 */
export function addEventHistoryVersion(eventIndex: number, newEvent: Event, type: "edit" | "regenerate"): void {
  if (eventIndex < 0) {
    return;
  }
  getState().set((state) => {
    const key = String(eventIndex);
    if (!state.eventHistory) {
      state.eventHistory = {};
    }
    if (!state.eventHistory[key]) {
      // Initialize history with current event if it doesn't exist
      const event = state.events[eventIndex];
      if (event) {
        state.eventHistory[key] = {
          entries: [
            {
              event: { ...event },
              timestamp: Date.now(),
              type: event.type === "action" ? "edit" : "regenerate",
            },
          ],
          currentVersionIndex: 0,
        };
      }
    }
    const history = state.eventHistory[key];
    if (history) {
      history.entries.push({
        event: newEvent,
        timestamp: Date.now(),
        type,
      });
      history.currentVersionIndex = history.entries.length - 1;
      // Update the actual event in the events array
      state.events[eventIndex] = newEvent;
    }
  });
}

/**
 * Select a version from history to make it current
 */
export function selectEventHistoryVersion(eventIndex: number, versionIndex: number): void {
  getState().set((state) => {
    const key = String(eventIndex);
    const history = state.eventHistory?.[key];
    if (history && versionIndex >= 0 && versionIndex < history.entries.length) {
      history.currentVersionIndex = versionIndex;
      state.events[eventIndex] = history.entries[versionIndex].event;
    }
  });
}

/**
 * Delete a version from history
 */
export function deleteEventHistoryVersion(eventIndex: number, versionIndex: number): void {
  getState().set((state) => {
    const key = String(eventIndex);
    const history = state.eventHistory?.[key];
    if (!history || versionIndex < 0 || versionIndex >= history.entries.length) {
      return;
    }

    // Don't allow deleting the last version
    if (history.entries.length <= 1) {
      return;
    }

    const wasCurrent = history.currentVersionIndex === versionIndex;
    const wasBeforeCurrent = versionIndex < history.currentVersionIndex;

    // Remove the entry
    history.entries.splice(versionIndex, 1);

    // Adjust currentVersionIndex if needed
    if (wasCurrent) {
      // If we deleted the current version, set to the previous one (or 0 if it was the first)
      history.currentVersionIndex = Math.max(0, versionIndex - 1);
      // Update the actual event in the events array
      state.events[eventIndex] = history.entries[history.currentVersionIndex].event;
    } else if (wasBeforeCurrent) {
      // If we deleted a version before the current one, decrement the index
      history.currentVersionIndex -= 1;
    }
    // If we deleted a version after the current one, no adjustment needed
  });
}

/**
 * Get paginated history entries for an event
 */
export function getEventHistoryPage(eventIndex: number, page: number, pageSize: number = 5): EventHistoryEntry[] {
  const state = getState();
  const key = String(eventIndex);
  const history = state.eventHistory?.[key];
  if (!history) {
    return [];
  }
  const start = page * pageSize;
  const end = start + pageSize;
  return history.entries.slice(start, end);
}

/**
 * Get total number of pages for an event's history
 */
export function getEventHistoryPageCount(eventIndex: number, pageSize: number = 5): number {
  const state = getState();
  const key = String(eventIndex);
  const history = state.eventHistory?.[key];
  if (!history) {
    return 0;
  }
  return Math.ceil(history.entries.length / pageSize);
}

/**
 * Set pagination state for history viewing
 */
export function setHistoryPagination(eventIndex: number, page: number, pageSize: number = 5): void {
  getState().set((state) => {
    state.historyPagination = {
      eventIndex,
      page,
      pageSize,
    };
  });
}

/**
 * Clear pagination state
 */
export function clearHistoryPagination(): void {
  getState().set((state) => {
    state.historyPagination = undefined;
  });
}

/**
 * Delete an event from the events array. History is preserved but the event is removed.
 */
export function deleteEvent(eventIndex: number): void {
  if (eventIndex < 0) {
    return;
  }
  getState().set((state) => {
    // Delete the event from the array
    state.events.splice(eventIndex, 1);

    // Clean up history if it exists
    const key = String(eventIndex);
    if (state.eventHistory?.[key]) {
      delete state.eventHistory[key];
    }

    // Adjust event indices in history for events after the deleted one
    // Since we're deleting from the array, all subsequent events shift down by 1
    if (state.eventHistory) {
      const newHistory: typeof state.eventHistory = {};
      for (const [histKey, histValue] of Object.entries(state.eventHistory)) {
        const histIndex = Number.parseInt(histKey, 10);
        if (!Number.isNaN(histIndex)) {
          if (histIndex > eventIndex) {
            // Shift the key down by 1
            newHistory[String(histIndex - 1)] = histValue;
          } else if (histIndex < eventIndex) {
            // Keep the same key
            newHistory[histKey] = histValue;
          }
          // Skip the deleted event's history (histIndex === eventIndex)
        }
      }
      state.eventHistory = newHistory;
    }
  });
}
