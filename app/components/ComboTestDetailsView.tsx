import { useState } from "react";
import type {
  ComboTestConfig,
  ScoredQuizConfig,
  SurveyRewardConfig,
} from "../lib/test-config.types";
import { RichTextPreview } from "./RichTextPreview";
import { TrialUnlockDetailsView } from "./TrialUnlockDetailsView";

type ComboTab = "trial_unlock" | "quiz" | "survey";

const TABS: {
  id: ComboTab;
  label: string;
  icon: "gift-card" | "forms" | "list-bulleted";
}[] = [
  { id: "trial_unlock", label: "Subscription Product Offer", icon: "gift-card" },
  { id: "quiz", label: "Quiz Product Offer", icon: "forms" },
  { id: "survey", label: "Survey Product Offer", icon: "list-bulleted" },
];

type Props = {
  config: ComboTestConfig;
};

function ProductSummary({
  title,
  imageUrl,
  subtitle,
}: {
  title: string | null;
  imageUrl: string | null;
  subtitle?: string;
}) {
  return (
    <s-stack direction="inline" gap="base" alignItems="center">
      {imageUrl ? (
        <s-thumbnail src={imageUrl} alt={title ?? "Product"} size="small" />
      ) : null}
      <s-stack direction="block" gap="none">
        <s-text type="strong">{title ?? "No product selected"}</s-text>
        {subtitle ? (
          <s-text tone="neutral" color="subdued">
            {subtitle}
          </s-text>
        ) : null}
      </s-stack>
    </s-stack>
  );
}

function QuizSummary({ config }: { config: ScoredQuizConfig }) {
  return (
    <s-stack direction="block" gap="base">
      <RichTextPreview value={config.introHeadline} />
      <s-text>
        {config.questions.length} questions · pass threshold{" "}
        {config.passThresholdPercent}%
      </s-text>
      <ProductSummary
        title={config.passProduct.productTitle}
        imageUrl={config.passProduct.productImageUrl}
        subtitle="Pass reward product"
      />
    </s-stack>
  );
}

function SurveySummary({ config }: { config: SurveyRewardConfig }) {
  const questions = config.steps.filter((s) => s.type === "question").length;
  const infoCards = config.steps.filter((s) => s.type === "info_card").length;

  return (
    <s-stack direction="block" gap="base">
      <RichTextPreview value={config.introHeadline} />
      <s-text>
        {config.steps.length} steps ({questions} questions, {infoCards} info cards)
      </s-text>
      <ProductSummary
        title={config.rewardProduct.productTitle}
        imageUrl={config.rewardProduct.productImageUrl}
        subtitle="Reward product"
      />
    </s-stack>
  );
}

export function ComboTestDetailsView({ config }: Props) {
  const [activeTab, setActiveTab] = useState<ComboTab>("trial_unlock");
  const splitTotal =
    config.trafficSplit.trial_unlock +
    config.trafficSplit.quiz +
    config.trafficSplit.survey;

  return (
    <s-stack direction="block" gap="base">
      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-stack direction="block" gap="base">
          <s-banner tone={splitTotal === 100 ? "success" : "warning"}>
            Traffic split total: {splitTotal}% (must equal 100%)
          </s-banner>
          <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
            <s-box padding="small" border="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="none">
                <s-text tone="neutral" color="subdued">
                  Subscription Product Offer
                </s-text>
                <s-heading>{config.trafficSplit.trial_unlock}%</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="small" border="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="none">
                <s-text tone="neutral" color="subdued">
                  Quiz Product Offer
                </s-text>
                <s-heading>{config.trafficSplit.quiz}%</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="small" border="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="none">
                <s-text tone="neutral" color="subdued">
                  Survey Product Offer
                </s-text>
                <s-heading>{config.trafficSplit.survey}%</s-heading>
              </s-stack>
            </s-box>
          </s-grid>
        </s-stack>
      </s-box>

      <s-box padding="base" border="base" borderRadius="base" background="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small">
            {TABS.map((tab) => (
              <s-button
                key={tab.id}
                variant={activeTab === tab.id ? "primary" : "secondary"}
                icon={tab.icon}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </s-button>
            ))}
          </s-stack>

          {activeTab === "trial_unlock" ? (
            <TrialUnlockDetailsView config={config.trialUnlock} />
          ) : null}
          {activeTab === "quiz" ? (
            <QuizSummary config={config.quiz} />
          ) : null}
          {activeTab === "survey" ? (
            <SurveySummary config={config.survey} />
          ) : null}
        </s-stack>
      </s-box>
    </s-stack>
  );
}
