import { forwardRef } from 'react';

/**
 * Orbit Input component.
 *
 * Props mirror a native <input> with extras:
 *   label, error, hint, leftIcon, rightIcon
 */
const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    id,
    className = '',
    disabled,
    ...props
  },
  ref,
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {LeftIcon && (
          <div className="absolute left-3 pointer-events-none">
            <LeftIcon className="w-4 h-4 text-text-muted" />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          className={[
            'w-full px-3 py-2.5 rounded-lg text-sm',
            'bg-white/5 border text-text placeholder-text-muted',
            'outline-none transition-colors',
            error
              ? 'border-red-500 focus:border-red-400'
              : 'border-border focus:border-primary',
            LeftIcon ? 'pl-9' : '',
            RightIcon ? 'pr-9' : '',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          {...props}
        />

        {RightIcon && (
          <div className="absolute right-3 pointer-events-none">
            <RightIcon className="w-4 h-4 text-text-muted" />
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
});

export default Input;
