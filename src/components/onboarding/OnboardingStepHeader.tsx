interface OnboardingStepHeaderProps {
  title: string;
  description?: string;
}

export function OnboardingStepHeader({ title, description }: OnboardingStepHeaderProps) {
  return (
    <div className="space-y-1.5 mb-6">
      <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-[var(--color-text)]">{title}</h2>
      {description && (
        <p className="text-[14px] md:text-[15px] text-[var(--color-text-muted)] leading-relaxed max-w-md">{description}</p>
      )}
    </div>
  );
}
