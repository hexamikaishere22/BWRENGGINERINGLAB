import type { ReactNode } from 'react';

type FormulaCardProps = {
  title: string;
  formula: string;
  label?: string;
  explanation?: string;
  children?: ReactNode;
};

export default function FormulaCard({ title, formula, explanation, children, label = 'ENGINEERING EQUATION' }: FormulaCardProps) {
  return (
    <div className="formula-card">
      <div className="formula-label">{label}</div>
      <h4>{title}</h4>
      <pre>{formula}</pre>
      {explanation && <p>{explanation}</p>}
      {children}
    </div>
  );
}
