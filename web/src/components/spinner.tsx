interface SpinnerProps {
  /** Text announced to assistive technologies and shown next to the animation. */
  readonly label: string;
}

export function Spinner({ label }: SpinnerProps) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner__wheel" aria-hidden="true" />
      <span className="spinner__label">{label}</span>
    </span>
  );
}
