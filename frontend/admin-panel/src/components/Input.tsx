import { InputHTMLAttributes, ReactNode, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  prefixIcon?: ReactNode;
  suffixIcon?: ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm:  'py-1.5 text-xs',
  md:  'py-2.5 text-sm',
  lg:  'py-3 text-base',
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, prefixIcon, suffixIcon, inputSize = 'md', className = '', ...props }, ref) => {
    const hasError = Boolean(error);
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-surface-700">
            {label}
            {props.required && <span className="ml-1 text-danger-base">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {prefixIcon && (
            <span className="absolute left-3 text-surface-400 pointer-events-none flex-shrink-0">
              {prefixIcon}
            </span>
          )}
          <input
            ref={ref}
            className={`block w-full rounded border bg-white
              ${sizeClasses[inputSize]}
              ${prefixIcon ? 'pl-9' : 'pl-3'}
              ${suffixIcon ? 'pr-9' : 'pr-3'}
              text-surface-800 placeholder:text-surface-400
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:bg-surface-50 disabled:text-surface-400 disabled:cursor-not-allowed
              ${hasError
                ? 'border-danger-base focus:border-danger-base focus:ring-danger-base/20'
                : 'border-surface-200 hover:border-surface-300 focus:border-brand-500 focus:ring-brand-500/20'
              } ${className}`}
            {...props}
          />
          {suffixIcon && (
            <span className="absolute right-3 text-surface-400 pointer-events-none flex-shrink-0">
              {suffixIcon}
            </span>
          )}
        </div>
        {(helperText || error) && (
          <p className={`text-xs ${hasError ? 'text-danger-dark' : 'text-surface-400'}`}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = 'Input';
export default Input;
