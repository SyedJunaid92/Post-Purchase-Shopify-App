import type { SurveyStep, SurveyQuestion, InfoCard } from "../lib/test-config.types";
import { normalizeInfoCard } from "../lib/test-config.types";
import { FunnelImagesEditor } from "./FunnelImagesEditor";
import { RichTextField } from "./RichTextField";

type Props = {
  steps: SurveyStep[];
  onChange: (steps: SurveyStep[]) => void;
};

function newQuestion(): SurveyStep {
  return {
    type: "question",
    question: {
      id: `q_${Date.now()}`,
      text: "",
      images: [],
      options: ["Option 1", "Option 2", "Option 3", "Option 4"],
    },
  };
}

function newInfoCard(): SurveyStep {
  return {
    type: "info_card",
    infoCard: normalizeInfoCard({
      id: `ic_${Date.now()}`,
      title: "",
      description: "",
      images: [],
    }),
  };
}

export function SurveyStepsEditor({ steps, onChange }: Props) {
  const updateStep = (index: number, step: SurveyStep) => {
    const next = steps.map((s, i) => (i === index ? step : s));
    onChange(next);
  };

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const next = [...steps];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <s-stack direction="block" gap="base">
      {steps.map((step, index) => (
        <s-box
          key={step.type === "question" ? step.question.id : step.infoCard.id}
          padding="base"
          border="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-badge
                tone={step.type === "question" ? "info" : "success"}
              >
                {step.type === "question" ? "Question" : "Info card"}
              </s-badge>
              <s-text type="strong">Step {index + 1}</s-text>
              <s-stack direction="inline" gap="base">
                {index > 0 && (
                  <s-button
                    variant="tertiary"
                    onClick={() => moveStep(index, "up")}
                  >
                    ↑
                  </s-button>
                )}
                {index < steps.length - 1 && (
                  <s-button
                    variant="tertiary"
                    onClick={() => moveStep(index, "down")}
                  >
                    ↓
                  </s-button>
                )}
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() => removeStep(index)}
                >
                  Remove
                </s-button>
              </s-stack>
            </s-stack>

            {step.type === "question" ? (
              <QuestionEditor
                question={step.question}
                onChange={(question) =>
                  updateStep(index, { type: "question", question })
                }
              />
            ) : (
              <InfoCardEditor
                infoCard={step.infoCard}
                onChange={(infoCard) =>
                  updateStep(index, { type: "info_card", infoCard })
                }
              />
            )}
          </s-stack>
        </s-box>
      ))}

      <s-stack direction="inline" gap="base">
        <s-button variant="secondary" onClick={() => onChange([...steps, newQuestion()])}>
          + Add question
        </s-button>
        <s-button variant="secondary" onClick={() => onChange([...steps, newInfoCard()])}>
          + Add info card
        </s-button>
      </s-stack>
    </s-stack>
  );
}

function QuestionEditor({
  question,
  onChange,
}: {
  question: SurveyQuestion;
  onChange: (q: SurveyQuestion) => void;
}) {
  const updateOption = (index: number, value: string) => {
    const options = question.options.map((o, i) => (i === index ? value : o));
    onChange({ ...question, options });
  };

  const addOption = () => {
    onChange({
      ...question,
      options: [...question.options, `Option ${question.options.length + 1}`],
    });
  };

  const removeOption = (index: number) => {
    if (question.options.length <= 2) return;
    onChange({
      ...question,
      options: question.options.filter((_, i) => i !== index),
    });
  };

  return (
    <s-stack direction="block" gap="base">
      <s-text-field
        label="Question text"
        value={question.text}
        onChange={(e: Event) =>
          onChange({ ...question, text: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <FunnelImagesEditor
        label="Question images"
        images={question.images ?? []}
        onChange={(images) => onChange({ ...question, images })}
      />
      {question.options.map((option, index) => (
        <div
          key={index}
          style={{ position: "relative", width: "100%" }}
        >
          <s-text-field
            label={`Option ${index + 1}`}
            value={option}
            onChange={(e: Event) =>
              updateOption(index, (e.currentTarget as HTMLInputElement).value)
            }
          />
          {question.options.length > 2 && (
            <div
              style={{
                position: "absolute",
                top: "1.625rem",
                right: "0.25rem",
                zIndex: 1,
              }}
            >
              <s-button
                variant="tertiary"
                tone="critical"
                accessibilityLabel={`Remove option ${index + 1}`}
                onClick={() => removeOption(index)}
              >
                ×
              </s-button>
            </div>
          )}
        </div>
      ))}
      <s-button variant="tertiary" onClick={addOption}>
        + Add option
      </s-button>
    </s-stack>
  );
}

function InfoCardEditor({
  infoCard,
  onChange,
}: {
  infoCard: InfoCard;
  onChange: (card: InfoCard) => void;
}) {
  return (
    <s-stack direction="block" gap="base">
      <s-text-field
        label="Card title"
        value={infoCard.title}
        onChange={(e: Event) =>
          onChange({ ...infoCard, title: (e.currentTarget as HTMLInputElement).value })
        }
      />
      <RichTextField
        label="Card description"
        value={infoCard.description}
        onChange={(description) => onChange({ ...infoCard, description })}
        minHeight={120}
      />
      <FunnelImagesEditor
        label="Card images"
        images={infoCard.images ?? []}
        onChange={(images) => onChange({ ...infoCard, images })}
      />
    </s-stack>
  );
}
