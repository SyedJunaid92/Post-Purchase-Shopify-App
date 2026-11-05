import {
  FUNNEL_TYPE_CATALOG,
  type FunnelTypeCatalogEntry,
} from "../lib/funnel-type-catalog";
import type { TestType } from "../lib/tests.types";
import { useAppNavigate } from "../hooks/useAppNavigate";

type Props = {
  allowedTestTypes: TestType[];
};

export function FunnelTypePicker({ allowedTestTypes }: Props) {
  return (
    <s-section>
      <s-stack direction="block" gap="large-400">
        <s-stack direction="block" gap="small-200">
          <s-heading>All funnel types</s-heading>
          <s-text tone="neutral" color="subdued">
            Pick what you want to experiment on. Paid plans unlock every funnel
            type and higher traffic limits.
          </s-text>
        </s-stack>

        <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="base">
          {FUNNEL_TYPE_CATALOG.map((entry) => (
            <FunnelTypeCard
              key={entry.type}
              entry={entry}
              allowed={allowedTestTypes.includes(entry.type)}
            />
          ))}
        </s-grid>
      </s-stack>
    </s-section>
  );
}

function FunnelTypeCard({
  entry,
  allowed,
}: {
  entry: FunnelTypeCatalogEntry;
  allowed: boolean;
}) {
  const appNavigate = useAppNavigate();

  const handleSelect = () => {
    if (allowed) {
      appNavigate(`/app/funnel/new/${entry.type}`);
      return;
    }
    appNavigate("/app/billing");
  };

  return (
    <button
      type="button"
      onClick={handleSelect}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        width: "100%",
      }}
    >
      <s-box
        padding="large-400"
        border="base"
        borderRadius="base"
        background="base"
      >
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="start">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: entry.iconBackground,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                opacity: allowed ? 1 : 0.55,
              }}
            >
              <s-icon type={entry.icon} tone="neutral" />
            </div>
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text tone="neutral" color="subdued">
                  {entry.category}
                </s-text>
                {!allowed ? <s-badge tone="warning">Upgrade</s-badge> : null}
              </s-stack>
              <s-heading>{entry.title}</s-heading>
            </s-stack>
          </s-stack>
          <s-paragraph tone="neutral" color="subdued">
            {entry.description}
          </s-paragraph>
        </s-stack>
      </s-box>
    </button>
  );
}
