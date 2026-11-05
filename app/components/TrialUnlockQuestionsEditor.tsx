import { useState } from "react";
import type { QuizQuestion } from "../lib/test-config.types";
import { FunnelImagesEditor } from "./FunnelImagesEditor";

type Props = {
  questions: QuizQuestion[];
  onChange: (questions: QuizQuestion[]) => void;
};

function newQuestion(): QuizQuestion {
  const id = `q_${Date.now()}`;
  return {
    id,
    text: "",
    images: [],
    options: [
      { label: "Option 1", score: 1 },
      { label: "Option 2", score: 2 },
      { label: "Option 3", score: 3 },
      { label: "Option 4", score: 4 },
    ],
  };
}

export function TrialUnlockQuestionsEditor({ questions, onChange }: Props) {
  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => {
    const next = questions.map((q, i) =>
      i === index ? { ...q, ...patch } : q,
    );
    onChange(next);
  };

  const updateOption = (
    qIndex: number,
    oIndex: number,
    patch: Partial<QuizQuestion["options"][0]>,
  ) => {
    const next = questions.map((q, i) => {
      if (i !== qIndex) return q;
      const options = q.options.map((o, j) =>
        j === oIndex ? { ...o, ...patch } : o,
      );
      return { ...q, options };
    });
    onChange(next);
  };

  return (
    <s-stack direction="block" gap="base">
      {questions.map((question, qIndex) => (
        <s-box
          key={question.id}
          padding="base"
          border="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text type="strong">Question {qIndex + 1}</s-text>
              {questions.length > 1 && (
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() =>
                    onChange(questions.filter((_, i) => i !== qIndex))
                  }
                >
                  Remove
                </s-button>
              )}
            </s-stack>
            <s-text-field
              label="Question text"
              value={question.text}
              onChange={(e: Event) => {
                const target = e.currentTarget as HTMLInputElement;
                updateQuestion(qIndex, { text: target.value });
              }}
            />
            <FunnelImagesEditor
              label="Question images"
              images={question.images ?? []}
              onChange={(images) => updateQuestion(qIndex, { images })}
            />
            {question.options.map((option, oIndex) => (
              <s-stack key={oIndex} direction="inline" gap="base">
                <s-text-field
                  label={`Option ${oIndex + 1}`}
                  value={option.label}
                  onChange={(e: Event) => {
                    const target = e.currentTarget as HTMLInputElement;
                    updateOption(qIndex, oIndex, { label: target.value });
                  }}
                />
                <s-number-field
                  label="Score"
                  value={String(option.score)}
                  min={1}
                  max={10}
                  onChange={(e: Event) => {
                    const target = e.currentTarget as HTMLInputElement;
                    updateOption(qIndex, oIndex, {
                      score: parseInt(target.value, 10) || 1,
                    });
                  }}
                />
              </s-stack>
            ))}
          </s-stack>
        </s-box>
      ))}
      <s-button variant="secondary" onClick={() => onChange([...questions, newQuestion()])}>
        Add question
      </s-button>
    </s-stack>
  );
}
