// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { Flex, ScrollArea, Text } from "@radix-ui/themes";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import ActionChoice from "@/components/ActionChoice";
import ErrorBar from "@/components/ErrorBar";
import EventView from "@/components/EventView";
import ProcessingBar from "@/components/ProcessingBar";
import { abort, isAbortError, next } from "@/lib/engine";
import { useStateStore } from "@/lib/state";

export default function Chat() {
  const [lastAction, setLastAction] = useState<string | undefined>(undefined);
  const [barVisible, setBarVisible] = useState(false);
  const [barTitle, setBarTitle] = useState("");
  const [barTokenCount, setBarTokenCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const doAction = async (action?: string) => {
    try {
      await next(action, (title, _message, tokenCount) => {
        setBarVisible(true);
        setBarTitle(title);
        setBarTokenCount(tokenCount);
      });
    } catch (error) {
      if (!isAbortError(error)) {
        let message = error instanceof Error ? error.message : String(error);
        if (!message) {
          message = "Unknown error";
        }
        setErrorMessage(message);
      }
    } finally {
      setBarVisible(false);
    }
  };

  const { events, actions } = useStateStore(
    useShallow((state) => ({
      events: state.events,
      actions: state.actions,
    })),
  );

  const eventsContainerRef = useRef<HTMLDivElement | null>(null);

  // Scroll to the bottom of the events container when new content is added.
  //
  // biome-ignore lint/correctness/useExhaustiveDependencies: The dependency is indirect.
  useEffect(() => {
    const eventsContainer = eventsContainerRef.current;
    if (eventsContainer) {
      eventsContainer.scroll({
        top: eventsContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [events]);

  // Forward the state machine once after transitioning to the chat view
  // to generate initial narration and actions.
  //
  // biome-ignore lint/correctness/useExhaustiveDependencies: This should run only once.
  useEffect(() => {
    if (actions.length === 0) {
      doAction();

      // Note that in Strict Mode (used during development), React runs the effect twice
      // *even with an empty dependency array*, so the cleanup function is important here
      // (see https://react.dev/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development).
      return () => abort();
    }
  }, []);

  return (
    <Flex width="100%" justify="center">
      <Flex
        className="bg-black border-l border-r border-(--gold-10) shadow-[0_0_30px_var(--slate-10)]"
        direction="column"
        width="60rem"
        height="100vh"
      >
        <ScrollArea ref={eventsContainerRef}>
          <Flex direction="column">
            {events.map((event, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Events are append-only, so this is valid.
              <EventView key={index} event={event} eventIndex={index} />
            ))}
          </Flex>
        </ScrollArea>

        {actions.length > 0 && !errorMessage && (
          <ActionChoice
            onAction={(action) => {
              setLastAction(action);
              doAction(action);
            }}
          />
        )}

        {barVisible && (
          <ProcessingBar title={barTitle} onCancel={abort}>
            <Text className="tabular-nums" as="div" align="right" size="4" color="lime" mr="2">
              {barTokenCount ? `Tokens generated: ${barTokenCount}` : "Waiting for response..."}
            </Text>
          </ProcessingBar>
        )}

        {errorMessage && (
          <ErrorBar
            errorMessage={errorMessage}
            onRetry={() => {
              setErrorMessage("");
              doAction(lastAction);
            }}
            onCancel={() => setErrorMessage("")}
          />
        )}
      </Flex>
    </Flex>
  );
}
