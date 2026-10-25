import { SelectHTMLAttributes, ReactNode, forwardRef } from "react";
import { ChevronDown } from "lucide-react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  selectSize?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const sizeClasses = {
  sm:  'py-1.5 text-xs',
  md:  'py-2.5 text-sm',
  lg:  'py-3 text-base',
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, helperText, error, selectSize = 'md', className = '', children, ...props }, ref) => {
    const hasError = Boolean(error);
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-surface-700">
            {label}
            {props.required && <span className="ml-1 text-danger-base">*</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`block w-full appearance-none rounded-md border bg-white
              ${sizeClasses[selectSize]} pl-3 pr-9
              text-surface-800
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:bg-surface-50 disabled:text-surface-400 disabled:cursor-not-allowed
              ${hasError
                ? 'border-danger-base focus:border-danger-base focus:ring-danger-base/20'
                : 'border-surface-200 hover:border-surface-300 focus:border-brand-500 focus:ring-brand-500/20'
              } ${className}`}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
          />
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
Select.displayName = 'Select';
export default Select;
