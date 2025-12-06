// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { memo } from "react";
import type { Event } from "@/lib/state";
import ActionEventView from "./ActionEventView";
import CharacterIntroductionEventView from "./CharacterIntroductionEventView";
import LocationChangeEventView from "./LocationChangeEventView";
import NarrationEventView from "./NarrationEventView";

// The list of events can grow very long, so this component is memoized
// to prevent re-rendering all events when one of them is updated.
export default memo(function EventView({
  event,
  eventIndex,
  showControls,
}: {
  event: Event;
  eventIndex?: number;
  showControls?: boolean;
}) {
  // Only pass eventIndex if it's valid (>= 0), otherwise pass undefined
  // This prevents using -1 as an array index which would cause silent failures
  const validEventIndex = eventIndex !== undefined && eventIndex >= 0 ? eventIndex : undefined;

  return (
    <>
      {event.type === "action" && (
        <ActionEventView event={event} eventIndex={validEventIndex} showControls={showControls} />
      )}
      {event.type === "narration" && (
        <NarrationEventView event={event} eventIndex={validEventIndex} showControls={showControls} />
      )}
      {event.type === "character_introduction" && <CharacterIntroductionEventView event={event} />}
      {event.type === "location_change" && <LocationChangeEventView event={event} />}
    </>
  );
});
