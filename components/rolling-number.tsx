"use client";

import { useState, type CSSProperties } from "react";
import { money } from "@/lib/projects";

function NumberReel({ value, formatted }: { value: number; formatted: string }) {
  const [display, setDisplay] = useState({ value, formatted, previous: null as string | null, descending: false });

  if (display.formatted !== formatted) {
    setDisplay({
      value,
      formatted,
      previous: display.formatted,
      descending: value < display.value,
    });
  }

  const characters = Array.from(formatted);
  const previousDigits = display.previous?.match(/[0-9]/g) ?? [];
  let digitsRemaining = formatted.match(/[0-9]/g)?.length ?? 0;

  return <span className="rolling-number">
    <span className="sr-only">{formatted}</span>
    <span aria-hidden="true">
      {characters.map((character, index) => {
        const slot = characters.length - index;
        if (!/[0-9]/.test(character)) return <span key={slot}>{character}</span>;

        const position = --digitsRemaining;
        const previous = previousDigits.at(-position - 1) ?? String((Number(character) + 9) % 10);
        const changed = previous !== character;

        return <span
          className="number-reel"
          key={slot}
          data-direction={display.descending ? "down" : "up"}
          style={{ "--reel-delay": `${Math.min(position, 4) * 12}ms` } as CSSProperties}
        >
          <span className={changed ? "number-reel-in" : undefined} key={character}>{character}</span>
          {changed && <span className="number-reel-out" key={`out-${character}`}>{previous}</span>}
        </span>;
      })}
    </span>
  </span>;
}

export function RollingNumber({ value, padStart = 0 }: { value: number; padStart?: number }) {
  return <NumberReel value={value} formatted={String(value).padStart(padStart, "0")} />;
}

export function RollingMoney({ cents }: { cents: number }) {
  return <NumberReel value={cents} formatted={money(cents)} />;
}
