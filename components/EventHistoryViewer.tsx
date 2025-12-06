// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { Box, Button, Dialog, Flex, IconButton, Text } from "@radix-ui/themes";
import { useState } from "react";
import { MdDelete } from "react-icons/md";
import { useShallow } from "zustand/shallow";
import {
  deleteEventHistoryVersion,
  type EventHistoryEntry,
  getEventHistoryPage,
  getEventHistoryPageCount,
  selectEventHistoryVersion,
  setHistoryPagination,
  useStateStore,
} from "@/lib/state";
import EventView from "./EventView";
import HistoryPagination from "./HistoryPagination";

interface EventHistoryViewerProps {
  eventIndex: number;
  onClose: () => void;
  onSelectVersion: (versionIndex: number) => void;
}

export default function EventHistoryViewer({ eventIndex, onClose, onSelectVersion }: EventHistoryViewerProps) {
  const [page, setPage] = useState(0);
  const pageSize = 5;

  const { eventHistory } = useStateStore(
    useShallow((state) => ({
      eventHistory: state.eventHistory,
    })),
  );

  const history = eventHistory?.[String(eventIndex)];
  const totalPages = getEventHistoryPageCount(eventIndex, pageSize);
  const pageEntries = getEventHistoryPage(eventIndex, page, pageSize);

  const handlePrevious = () => {
    if (page > 0) {
      const newPage = page - 1;
      setPage(newPage);
      setHistoryPagination(eventIndex, newPage, pageSize);
    }
  };

  const handleNext = () => {
    if (page < totalPages - 1) {
      const newPage = page + 1;
      setPage(newPage);
      setHistoryPagination(eventIndex, newPage, pageSize);
    }
  };

  const handleSelectVersion = (_entry: EventHistoryEntry, entryIndex: number) => {
    // Calculate the actual version index in the full history
    const actualVersionIndex = page * pageSize + entryIndex;
    selectEventHistoryVersion(eventIndex, actualVersionIndex);
    onSelectVersion(actualVersionIndex);
    onClose();
  };

  const handleDeleteVersion = (entryIndex: number) => {
    // Calculate the actual version index in the full history
    const actualVersionIndex = page * pageSize + entryIndex;
    deleteEventHistoryVersion(eventIndex, actualVersionIndex);

    // If we deleted an entry and the current page becomes empty, go to previous page
    const newHistory = useStateStore.getState().eventHistory?.[String(eventIndex)];
    if (newHistory) {
      const newTotalPages = Math.ceil(newHistory.entries.length / pageSize);
      if (page >= newTotalPages && page > 0) {
        setPage(page - 1);
        setHistoryPagination(eventIndex, page - 1, pageSize);
      }
    }
  };

  if (!history || history.entries.length === 0) {
    return null;
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content maxWidth="60rem" size="4">
        <Dialog.Title>History</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Select a version to restore
        </Dialog.Description>

        <Flex direction="column" gap="3" maxHeight="60vh" style={{ overflowY: "auto" }}>
          {pageEntries.map((entry, entryIndex) => {
            const actualVersionIndex = page * pageSize + entryIndex;
            const isCurrent = history.currentVersionIndex === actualVersionIndex;
            return (
              <Box
                key={actualVersionIndex}
                className={`border rounded-lg p-4 ${isCurrent ? "bg-(--sky-2) border-(--sky-6)" : "bg-(--slate-2) border-(--slate-6)"}`}
              >
                <Flex direction="column" gap="2">
                  <Flex justify="between" align="center">
                    <Text size="2" color="gray">
                      {new Date(entry.timestamp).toLocaleString()}
                    </Text>
                    <Flex gap="2" align="center">
                      <Text size="2" color="gray" style={{ textTransform: "capitalize" }}>
                        {entry.type}
                      </Text>
                      {history.entries.length > 1 && (
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="red"
                          onClick={() => handleDeleteVersion(entryIndex)}
                          title="Delete this version"
                        >
                          <MdDelete />
                        </IconButton>
                      )}
                    </Flex>
                  </Flex>
                  <Box className="bg-black rounded p-3">
                    <EventView event={entry.event} eventIndex={eventIndex} showControls={false} />
                  </Box>
                  {!isCurrent && (
                    <Button size="2" variant="soft" onClick={() => handleSelectVersion(entry, entryIndex)}>
                      Restore this version
                    </Button>
                  )}
                  {isCurrent && (
                    <Text size="2" color="green">
                      Current version
                    </Text>
                  )}
                </Flex>
              </Box>
            );
          })}
        </Flex>

        <HistoryPagination currentPage={page} totalPages={totalPages} onPrevious={handlePrevious} onNext={handleNext} />

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
