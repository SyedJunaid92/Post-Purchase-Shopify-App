import {
  TEST_STATUS_LABELS,
  TEST_STATUS_TONE,
  type TestStatus,
} from "../lib/tests.types";

type Props = {
  status: TestStatus;
};

export function TestStatusBadge({ status }: Props) {
  return (
    <s-badge tone={TEST_STATUS_TONE[status]}>{TEST_STATUS_LABELS[status]}</s-badge>
  );
}
