"use client";

/**
 * Keypad numérico para login por PIN. Pensado para uso táctil con guantes:
 * botones de 96+ px, contraste alto, feedback visual por dígito.
 *
 * Flujo:
 *  1. Operario tipea hasta 6 dígitos. Cada uno se refleja en los dots.
 *  2. Al llegar a 6, se llama `onComplete(pin)` automáticamente.
 *  3. El padre maneja el POST y, si hay error, llama `reset()` (vía ref) o
 *     setea `error` para mostrarlo (este componente no lo controla por dentro).
 */
import * as React from "react";
import { Delete, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PinKeypadProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  /** Si el padre quiere limpiar el input externamente, cambia esta key. */
  resetKey?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const PIN_LENGTH = 6;

export function PinKeypad({ onComplete, disabled, error, resetKey }: PinKeypadProps) {
  const [pin, setPin] = React.useState("");

  React.useEffect(() => {
    setPin("");
  }, [resetKey]);

  React.useEffect(() => {
    if (pin.length === PIN_LENGTH && !disabled) {
      onComplete(pin);
    }
  }, [pin, disabled, onComplete]);

  const push = (d: string) => {
    if (disabled) return;
    setPin((curr) => (curr.length >= PIN_LENGTH ? curr : curr + d));
  };

  const backspace = () => {
    if (disabled) return;
    setPin((curr) => curr.slice(0, -1));
  };

  const clear = () => {
    if (disabled) return;
    setPin("");
  };

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Dots del PIN */}
      <div
        className={cn(
          "flex gap-4",
          error && "animate-[shake_0.4s_ease-in-out]"
        )}
        aria-label={`PIN, ${pin.length} de ${PIN_LENGTH} dígitos ingresados`}
        role="status"
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-5 w-5 rounded-full border-2 transition",
              i < pin.length
                ? error
                  ? "bg-destructive border-destructive"
                  : "bg-primary border-primary"
                : "border-muted-foreground/40"
            )}
          />
        ))}
      </div>

      {error && (
        <p className="text-destructive text-base font-medium" role="alert">
          {error}
        </p>
      )}

      {/* Keypad 3x4 */}
      <div className="grid grid-cols-3 gap-4">
        {KEYS.map((d) => (
          <Button
            key={d}
            type="button"
            variant="keypad"
            size="keypad"
            onClick={() => push(d)}
            disabled={disabled}
            aria-label={`Dígito ${d}`}
          >
            {d}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="keypad"
          onClick={clear}
          disabled={disabled || pin.length === 0}
          aria-label="Borrar todo"
          className="text-base"
        >
          Limpiar
        </Button>
        <Button
          type="button"
          variant="keypad"
          size="keypad"
          onClick={() => push("0")}
          disabled={disabled}
          aria-label="Dígito 0"
        >
          0
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="keypad"
          onClick={backspace}
          disabled={disabled || pin.length === 0}
          aria-label="Borrar último dígito"
        >
          <Delete className="h-10 w-10" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
