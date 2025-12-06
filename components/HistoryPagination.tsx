// SPDX-License-Identifier: AGPL-3.0-or-later

import { Button, Flex, Text } from "@radix-ui/themes";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";

interface HistoryPaginationProps {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}

export default function HistoryPagination({ currentPage, totalPages, onPrevious, onNext }: HistoryPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <Flex align="center" gap="3" justify="center" p="2">
      <Button variant="soft" size="2" onClick={onPrevious} disabled={currentPage === 0}>
        <MdChevronLeft />
        Previous
      </Button>
      <Text size="2" color="gray">
        Page {currentPage + 1} of {totalPages}
      </Text>
      <Button variant="soft" size="2" onClick={onNext} disabled={currentPage >= totalPages - 1}>
        Next
        <MdChevronRight />
      </Button>
    </Flex>
  );
}
