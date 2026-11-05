import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { Test } from "../lib/tests.server";

type Props = {
  test: Test;
};

export function TestActionsMenu({ test }: Props) {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const popoverId = `test-actions-${test.id}`;
  const isBusy = fetcher.state !== "idle";

  const runAction = (intent: "pause" | "resume" | "end") => {
    const formData = new FormData();
    formData.set("intent", intent);
    formData.set("testId", test.id);
    fetcher.submit(formData, { method: "POST" });

    const messages = {
      pause: "Test paused",
      resume: "Test activated",
      end: "Test ended",
    };
    shopify.toast.show(messages[intent]);
  };

  return (
    <>
      <s-button
        icon="menu-vertical"
        variant="tertiary"
        accessibilityLabel={`Actions for ${test.name}`}
        commandFor={popoverId}
        command="--toggle"
        disabled={isBusy}
      />
      <s-popover id={popoverId}>
        <s-stack direction="block" gap="none">
          {test.status === "active" && (
            <s-button variant="tertiary" onClick={() => runAction("pause")}>
              Pause test
            </s-button>
          )}
          {(test.status === "paused" || test.status === "draft") && (
            <s-button variant="tertiary" onClick={() => runAction("resume")}>
              {test.status === "draft" ? "Activate test" : "Resume test"}
            </s-button>
          )}
          {test.status !== "closed" && (
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={() => runAction("end")}
            >
              End test
            </s-button>
          )}
        </s-stack>
      </s-popover>
    </>
  );
}
