type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'h-3 w-3 border-[2px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
  xl: 'h-12 w-12 border-4',
};

export default function Spinner({ size = 'md', className = '' }: { size?: SpinnerSize; className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-surface-200 border-t-brand-500 animate-spin-slow ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
