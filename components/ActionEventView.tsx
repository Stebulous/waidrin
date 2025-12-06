// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025  Philipp Emanuel Weidmann <pew@worldwidemann.com>

import { Box, Button, Flex, IconButton, Text, TextField } from "@radix-ui/themes";
import { useState } from "react";
import { MdDelete, MdEdit, MdHistory } from "react-icons/md";
import { useShallow } from "zustand/shallow";
import { type ActionEvent, addEventHistoryVersion, deleteEvent, ensureEventHistory, useStateStore } from "@/lib/state";
import EventHistoryViewer from "./EventHistoryViewer";

interface ActionEventViewProps {
  event: ActionEvent;
  eventIndex?: number;
  showControls?: boolean;
}

export default function ActionEventView({ event, eventIndex, showControls = true }: ActionEventViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(event.action);
  const [showHistory, setShowHistory] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const { eventHistory } = useStateStore(
    useShallow((state) => ({
      eventHistory: state.eventHistory,
    })),
  );

  const history = eventHistory?.[String(eventIndex)];
  const hasMultipleVersions = history && history.entries.length > 1;

  const handleEdit = () => {
    setIsEditing(true);
    setEditText(event.action);
  };

  const handleSave = () => {
    if (editText.trim() && editText.trim() !== event.action && eventIndex !== undefined && eventIndex >= 0) {
      ensureEventHistory(eventIndex);
      const newEvent: ActionEvent = {
        type: "action",
        action: editText.trim(),
      };
      addEventHistoryVersion(eventIndex, newEvent, "edit");
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(event.action);
    setIsEditing(false);
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

  if (isEditing) {
    return (
      <Box className="bg-(--sky-1)" width="100%" p="6">
        <Flex direction="column" gap="3">
          <TextField.Root
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            maxLength={200}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              } else if (e.key === "Escape") {
                handleCancel();
              }
            }}
          />
          <Flex gap="2">
            <Button size="2" onClick={handleSave} disabled={!editText.trim()}>
              Save
            </Button>
            <Button size="2" variant="soft" color="gray" onClick={handleCancel}>
              Cancel
            </Button>
          </Flex>
        </Flex>
      </Box>
    );
  }

  return (
    <>
      <Box
        className="bg-(--sky-1)"
        width="100%"
        p="6"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Flex justify="between" align="center" gap="2">
          <Text size="6" color="gray" style={{ flex: 1 }}>
            {event.action}
          </Text>
          {showControls && eventIndex !== undefined && eventIndex >= 0 && isHovered && (
            <Flex gap="2">
              {hasMultipleVersions && (
                <IconButton size="2" variant="ghost" color="gray" onClick={handleShowHistory} title="View history">
                  <MdHistory />
                </IconButton>
              )}
              <IconButton size="2" variant="ghost" color="gray" onClick={handleEdit} title="Edit">
                <MdEdit />
              </IconButton>
              <IconButton size="2" variant="ghost" color="red" onClick={handleDelete} title="Delete">
                <MdDelete />
              </IconButton>
            </Flex>
          )}
        </Flex>
      </Box>
      {showHistory && eventIndex !== undefined && eventIndex >= 0 && (
        <EventHistoryViewer
          eventIndex={eventIndex}
          onClose={() => setShowHistory(false)}
          onSelectVersion={() => {
            // History viewer will update the state, just close
            setShowHistory(false);
          }}
        />
      )}
    </>
  );
}
