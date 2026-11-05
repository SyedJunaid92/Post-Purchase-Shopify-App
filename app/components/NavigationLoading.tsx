import { useEffect, useState } from "react";
import { useNavigation } from "react-router";

/**
 * Non-blocking top progress indicator for route transitions.
 * Keeps the page visible — no full-screen overlay that feels stuck.
 */
export function NavigationLoading() {
  const navigation = useNavigation();
  const isBusy =
    navigation.state === "loading" || navigation.state === "submitting";
  const [visible, setVisible] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (isBusy) {
      setCompleting(false);
      setVisible(true);
      return;
    }

    if (!visible) return;

    setCompleting(true);
    const timer = window.setTimeout(() => {
      setVisible(false);
      setCompleting(false);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [isBusy, visible]);

  if (!visible) return null;

  return (
    <div
      className={`pp-top-progress${completing ? " pp-top-progress--complete" : ""}`}
      aria-hidden
    >
      <div className="pp-top-progress__track">
        <div className="pp-top-progress__bar" />
      </div>
    </div>
  );
}
