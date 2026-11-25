"use client";
import { useState } from "react";

// Inline form validation: instead of the browser's one-at-a-time bubble, every
// field with a problem gets a plain message underneath it, all at once.
//
//   const v = useFieldErrors();
//   <form {...v.form(submit)}> … <input id="email" required /> <FieldError v={v} id="email" />
//
// The rules still come from the inputs themselves (required, type, minLength).

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isField(el: Element): el is Field {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function messageFor(el: Pick<Field, "validity" | "type"> & { minLength?: number }): string {
  const v = el.validity;
  if (v.valueMissing) {
    if (el.type === "email") return "Please enter your email address.";
    if (el.type === "password") return "Please enter your password.";
    return "Please fill this in.";
  }
  if (v.typeMismatch && el.type === "email") return "That doesn't look like an email address. It should look like name@example.com.";
  if (v.tooShort) return `Use at least ${el.minLength} characters.`;
  if (v.patternMismatch) return "That isn't in the format we expected. Please check it.";
  return "Please check this field.";
}

export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function check(form: HTMLFormElement): boolean {
    const found: Record<string, string> = {};
    let first: Field | null = null;
    for (const el of Array.from(form.elements)) {
      if (!isField(el) || !el.id || !el.willValidate || el.validity.valid) continue;
      found[el.id] = messageFor(el);
      first ??= el;
    }
    setErrors(found);
    first?.focus();
    return first === null;
  }

  /** Props for the <form>: runs `onValid` only when every field passes. */
  function form(onValid: (e: React.FormEvent<HTMLFormElement>) => void) {
    return {
      noValidate: true,
      onSubmit: (e: React.FormEvent<HTMLFormElement>) => {
        if (check(e.currentTarget)) onValid(e);
        else e.preventDefault();
      },
      // A message goes away as soon as the person starts fixing that field.
      onInput: (e: React.FormEvent<HTMLFormElement>) => {
        const id = (e.target as HTMLElement).id;
        if (id && errors[id]) setErrors(({ [id]: _gone, ...rest }) => rest);
      },
    };
  }

  return { errors, form };
}

export function FieldError({ v, id }: { v: { errors: Record<string, string> }; id: string }) {
  const message = v.errors[id];
  if (!message) return null;
  return (
    <div className="field-error" role="alert">
      {message}
    </div>
  );
}
