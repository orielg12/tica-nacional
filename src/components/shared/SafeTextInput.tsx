import React, { useRef, useEffect, useState } from 'react';

interface SafeTextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
}

/**
 * SafeTextInput
 * Resuelve definitivamente el bug de escritura invertida en Samsung Galaxy Note 9 / S9
 * y otros teclados Samsung en Android WebView donde el cursor se resetea al inicio (índice 0)
 * tras cada re-render controlado de React.
 */
export const SafeTextInput: React.FC<SafeTextInputProps> = ({
  value,
  onChange,
  onValueChange,
  className = '',
  placeholder = '',
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setIsFocused] = useState(false);
  const lastCursorPos = useRef<number | null>(null);

  // Sincronizar el DOM cuando el valor cambia externamente (ej. reset del formulario)
  useEffect(() => {
    if (inputRef.current) {
      if (inputRef.current.value !== value) {
        inputRef.current.value = value;
      }
    }
  }, [value]);

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const newVal = target.value;
    const currentCursor = target.selectionStart;

    lastCursorPos.current = currentCursor;
    if (onChange) onChange(newVal);
    if (onValueChange) onValueChange(newVal);

    // En Samsung Keyboard en Android WebView, requestAnimationFrame garantiza que
    // si el WebView reseteó el cursor a 0, lo devolvemos a la posición correcta
    requestAnimationFrame(() => {
      if (inputRef.current && lastCursorPos.current !== null) {
        try {
          // Si el cursor fue forzado a 0 pero se había escrito texto, colocarlo en la posición registrada
          const pos = lastCursorPos.current > 0 ? lastCursorPos.current : newVal.length;
          inputRef.current.setSelectionRange(pos, pos);
        } catch {
          // Ignorar si el tipo de input no soporta setSelectionRange
        }
      }
    });
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (rest.onFocus) rest.onFocus(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    // Al perder el foco, asegurar sincronización exacta
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
    if (rest.onBlur) rest.onBlur(e);
  };

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      type="text"
      dir="ltr"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      autoCapitalize="words"
      data-form-type="other"
      data-lpignore="true"
      placeholder={placeholder}
      className={className}
      {...rest}
    />
  );
};

export default SafeTextInput;
