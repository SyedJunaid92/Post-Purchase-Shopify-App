import { useState } from "react";
import type {
  ComboTestConfig,
  ScoredQuizConfig,
  SurveyRewardConfig,
  TrialUnlockConfig,
} from "../lib/test-config.types";
import { TrialUnlockConfigEditor } from "./TrialUnlockConfigEditor";
import { TrialUnlockQuestionsEditor } from "./TrialUnlockQuestionsEditor";
import { SurveyStepsEditor } from "./SurveyStepsEditor";
import {
  QuizFailFields,
  QuizIntroFields,
  QuizPassFields,
} from "./QuizFunnelFields";
import { SurveyIntroFields } from "./SurveyIntroFields";
import { SurveyRewardFields } from "./SurveyRewardFields";
import { RichTextField } from "./RichTextField";
import {
  ProductPickerField,
  type SelectedProduct,
} from "./ProductPickerField";

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
  comboTest: ComboTestConfig;
  onComboTestChange: (config: ComboTestConfig) => void;
  trialProduct: SelectedProduct | null;
  onTrialProductChange: (product: SelectedProduct | null) => void;
  quizProduct: SelectedProduct | null;
  onQuizProductChange: (product: SelectedProduct | null) => void;
  surveyProduct: SelectedProduct | null;
  onSurveyProductChange: (product: SelectedProduct | null) => void;
};

export function ComboTestEditor({
  comboTest,
  onComboTestChange,
  trialProduct,
  onTrialProductChange,
  quizProduct,
  onQuizProductChange,
  surveyProduct,
  onSurveyProductChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<ComboTab>("trial_unlock");

  const splitTotal =
    comboTest.trafficSplit.trial_unlock +
    comboTest.trafficSplit.quiz +
    comboTest.trafficSplit.survey;

  const setTrialUnlock = (trialUnlock: TrialUnlockConfig) =>
    onComboTestChange({ ...comboTest, trialUnlock });

  const setQuiz = (quiz: ScoredQuizConfig) =>
    onComboTestChange({ ...comboTest, quiz });

  const setSurvey = (survey: SurveyRewardConfig) =>
    onComboTestChange({ ...comboTest, survey });

  const setSplit = (key: keyof ComboTestConfig["trafficSplit"], value: number) =>
    onComboTestChange({
      ...comboTest,
      trafficSplit: { ...comboTest.trafficSplit, [key]: value },
    });

  return (
    <s-stack direction="block" gap="base">
      <s-section heading="Traffic split">
        <s-box padding="base" border="base" borderRadius="base" background="base">
          <s-stack direction="block" gap="base">
            <s-banner tone={splitTotal === 100 ? "success" : "warning"}>
              Split total: {splitTotal}% — must equal 100%
            </s-banner>
            <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
              <s-number-field
                label="Subscription Product Offer (%)"
                value={String(comboTest.trafficSplit.trial_unlock)}
                min={0}
                max={100}
                onChange={(e: Event) =>
                  setSplit(
                    "trial_unlock",
                    parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0,
                  )
                }
              />
              <s-number-field
                label="Quiz Product Offer (%)"
                value={String(comboTest.trafficSplit.quiz)}
                min={0}
                max={100}
                onChange={(e: Event) =>
                  setSplit(
                    "quiz",
                    parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0,
                  )
                }
              />
              <s-number-field
                label="Survey Product Offer (%)"
                value={String(comboTest.trafficSplit.survey)}
                min={0}
                max={100}
                onChange={(e: Event) =>
                  setSplit(
                    "survey",
                    parseInt((e.currentTarget as HTMLInputElement).value, 10) || 0,
                  )
                }
              />
            </s-grid>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Flow configuration">
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
              <TrialUnlockTab
                config={comboTest.trialUnlock}
                onChange={setTrialUnlock}
                product={trialProduct}
                onProductChange={onTrialProductChange}
              />
            ) : null}

            {activeTab === "quiz" ? (
              <QuizTab
                config={comboTest.quiz}
                onChange={setQuiz}
                product={quizProduct}
                onProductChange={onQuizProductChange}
              />
            ) : null}

            {activeTab === "survey" ? (
              <SurveyTab
                config={comboTest.survey}
                onChange={setSurvey}
                product={surveyProduct}
                onProductChange={onSurveyProductChange}
              />
            ) : null}
          </s-stack>
        </s-box>
      </s-section>
    </s-stack>
  );
}

function TrialUnlockTab({
  config,
  onChange,
  product,
  onProductChange,
}: {
  config: TrialUnlockConfig;
  onChange: (config: TrialUnlockConfig) => void;
  product: SelectedProduct | null;
  onProductChange: (product: SelectedProduct | null) => void;
}) {
  return (
    <s-stack direction="block" gap="base">
      <s-text tone="neutral" color="subdued">
        Customers who land in this variant see the trial unlock funnel after
        checkout.
      </s-text>
      <TrialUnlockConfigEditor config={config} onChange={onChange} />
      <s-divider />
      <s-heading>Subscription trial product</s-heading>
      <ProductPickerField
        label="Trial product (subscription only)"
        product={product}
        onChange={onProductChange}
        subscriptionOnly
      />
      <RichTextField
        label="Product description"
        value={config.product.customDescription ?? ""}
        onChange={(customDescription) =>
          onChange({
            ...config,
            product: { ...config.product, customDescription },
          })
        }
      />
    </s-stack>
  );
}

function QuizTab({
  config,
  onChange,
  product,
  onProductChange,
}: {
  config: ScoredQuizConfig;
  onChange: (config: ScoredQuizConfig) => void;
  product: SelectedProduct | null;
  onProductChange: (product: SelectedProduct | null) => void;
}) {
  return (
    <s-stack direction="block" gap="base">
      <s-text tone="neutral" color="subdued">
        Scored quiz with pass/fail paths. Reward product is auto-added when
        customers pass.
      </s-text>
      <QuizIntroFields config={config} onChange={onChange} />
      <s-divider />
      <s-heading>Questions</s-heading>
      <TrialUnlockQuestionsEditor
        questions={config.questions}
        onChange={(questions) => onChange({ ...config, questions })}
      />
      <s-divider />
      <s-heading>Pass reward</s-heading>
      <QuizPassFields
        config={config}
        onChange={onChange}
        product={product}
        onProductChange={onProductChange}
        productLabel="Reward product (auto-added on pass)"
      />
      <s-divider />
      <s-heading>Fail path</s-heading>
      <QuizFailFields config={config} onChange={onChange} />
    </s-stack>
  );
}

function SurveyTab({
  config,
  onChange,
  product,
  onProductChange,
}: {
  config: SurveyRewardConfig;
  onChange: (config: SurveyRewardConfig) => void;
  product: SelectedProduct | null;
  onProductChange: (product: SelectedProduct | null) => void;
}) {
  return (
    <s-stack direction="block" gap="base">
      <s-text tone="neutral" color="subdued">
        Short survey with optional info cards, then a reward product at the end.
      </s-text>
      <SurveyIntroFields config={config} onChange={onChange} />
      <s-divider />
      <s-heading>Survey steps</s-heading>
      <SurveyStepsEditor
        steps={config.steps}
        onChange={(steps) => onChange({ ...config, steps })}
      />
      <s-divider />
      <s-heading>Reward</s-heading>
      <SurveyRewardFields
        config={config}
        onChange={onChange}
        product={product}
        onProductChange={onProductChange}
      />
    </s-stack>
  );
}
