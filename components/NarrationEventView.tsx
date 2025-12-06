// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { Box, Flex, HoverCard, IconButton, Link, Text } from "@radix-ui/themes";
import { useCallback, useMemo, useState } from "react";
import { MdDelete, MdHistory, MdRefresh } from "react-icons/md";
import Markdown from "react-markdown";
import { useShallow } from "zustand/shallow";
import { isAbortError, regenerateNarration } from "@/lib/engine";
import { deleteEvent, ensureEventHistory, type NarrationEvent, useStateStore } from "@/lib/state";
import CharacterView from "./CharacterView";
import EventHistoryViewer from "./EventHistoryViewer";

interface NarrationEventViewProps {
  event: NarrationEvent;
  eventIndex?: number;
  showControls?: boolean;
}

export default function NarrationEventView({ event, eventIndex, showControls = true }: NarrationEventViewProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { characters, eventHistory } = useStateStore(
    useShallow((state) => ({
      characters: state.characters,
      eventHistory: state.eventHistory,
    })),
  );

  const history = eventIndex !== undefined && eventIndex >= 0 ? eventHistory?.[String(eventIndex)] : undefined;
  const hasMultipleVersions = history && history.entries.length > 1;

  // Hack to highlight dialogue in text:
  //
  // 1. Surround quoted portions of text with asterisks, marking them as italics.
  // 2. Use a custom <em> component (see below) to render italics as dialogue
  //    if they start with quotation marks.
  //
  // It would be cleaner to use a dedicated semantic element instead (e.g. <span class="...">),
  // but that requires enabling HTML support in react-markdown, which is a security risk.
  const markdown = event.text.replaceAll(/".*?(?:"|$)/g, "*$&*");

  const NameView = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: The correct type is private in react-markdown.
    (props: any) => {
      const { children } = props;

      if (typeof children === "string") {
        const possessiveSuffix = /'s?$/;
        const name = children.replace(possessiveSuffix, "");

        for (const character of characters) {
          if (character.name === name || character.name.split(" ")[0] === name) {
            return (
              <HoverCard.Root>
                <HoverCard.Trigger>
                  <Link color="blue" href="#" onClick={(event) => event.preventDefault()}>
                    {children}
                  </Link>
                </HoverCard.Trigger>
                <HoverCard.Content maxWidth="40rem">
                  <Box p="2">
                    <CharacterView character={character} />
                  </Box>
                </HoverCard.Content>
              </HoverCard.Root>
            );
          }
        }
      }

      return <strong>{children}</strong>;
    },
    [characters],
  );

  const DialogueView = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: The correct type is private in react-markdown.
    (props: any) => {
      const { children } = props;

      const firstChild = Array.isArray(children) && children.length > 0 ? children[0] : children;

      if (typeof firstChild === "string" && firstChild.startsWith('"')) {
        return <Text color="amber">{children}</Text>;
      } else {
        return <em>{children}</em>;
      }
    },
    [],
  );

  const components = useMemo(
    () => ({
      strong: NameView,
      em: DialogueView,
    }),
    [NameView, DialogueView],
  );

  const handleRegenerate = async () => {
    if (isRegenerating || eventIndex === undefined || eventIndex < 0) {
      return;
    }
    setIsRegenerating(true);
    try {
      ensureEventHistory(eventIndex);
      await regenerateNarration(eventIndex, (_title, _message, _tokenCount) => {
        // Progress is handled by ProcessingBar in Chat component
      });
    } catch (error) {
      if (!isAbortError(error)) {
        console.error("Failed to regenerate narration:", error);
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleShowHistory = () => {
    if (eventIndex !== undefined && eventIndex >= 0) {
      ensureEventHistory(eventIndex);
      setShowHistory(true);
    }
  };

  const handleDelete = () => {
    if (eventIndex !== undefined && eventIndex >= 0) {
      deleteEvent(eventIndex);
    }
  };

  return (
    <>
      <Box
        className="text-(length:--font-size-5) [&_p]:mb-[0.7em]"
        width="100%"
        p="6"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {showControls && eventIndex !== undefined && eventIndex >= 0 && isHovered && (
          <Flex justify="end" gap="2" mb="2">
            {hasMultipleVersions && (
              <IconButton size="2" variant="ghost" color="gray" onClick={handleShowHistory} title="View history">
                <MdHistory />
              </IconButton>
            )}
            <IconButton
              size="2"
              variant="ghost"
              color="gray"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              title="Regenerate"
            >
              <MdRefresh />
            </IconButton>
            <IconButton size="2" variant="ghost" color="red" onClick={handleDelete} title="Delete">
              <MdDelete />
            </IconButton>
          </Flex>
        )}
        <Markdown components={components}>{markdown}</Markdown>
      </Box>
      {showHistory && eventIndex !== undefined && eventIndex >= 0 && (
        <EventHistoryViewer
          eventIndex={eventIndex}
          onClose={() => setShowHistory(false)}
          onSelectVersion={() => {
            setShowHistory(false);
          }}
        />
      )}
    </>
  );
}
