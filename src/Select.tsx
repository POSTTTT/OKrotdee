import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export interface Choice {
  value: string;
  label: string;
}

/**
 * A dropdown drawn by the app. A native select opens a list the system draws,
 * which no stylesheet reaches; this one opens a list of ours, in the app's
 * look, everywhere. It keeps what staff rely on in the native one: arrow
 * keys, Enter, Escape, typing a letter to jump, and a form field under the
 * given name that FormData reads and `required` checks.
 */
export default function Select({
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  required = false,
  "aria-label": ariaLabel,
}: {
  options: Choice[];
  /** Given, the caller holds the value; otherwise the field keeps its own. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  required?: boolean;
  "aria-label"?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const [open, setOpen] = useState(false);
  // The option the keyboard or pointer is on, by index.
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const chosen = options.find((o) => o.value === current);

  const choose = (next: string) => {
    if (value === undefined) setOwn(next);
    if (next !== current) onChange?.(next);
    setOpen(false);
    button.current?.focus();
  };

  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === current),
      ),
    );
    setOpen(true);
  };

  // Placed against the window, not the field: a dialog scrolls its content
  // and would cut off a list that ran past its edge. Below the field when it
  // fits, above when it does not, and the chosen option scrolled into view.
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return;
    const at = button.current.getBoundingClientRect();
    const el = list.current;
    const gap = 4;
    el.style.minWidth = `${at.width}px`;
    el.style.left = `${Math.max(gap, Math.min(at.left, innerWidth - el.offsetWidth - gap))}px`;
    const below = innerHeight - at.bottom - gap;
    el.style.top =
      el.offsetHeight <= below || below >= at.top
        ? `${at.bottom + gap}px`
        : `${Math.max(gap, at.top - gap - el.offsetHeight)}px`;
    el.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // Closed by a click elsewhere, or by the page moving under it.
  useEffect(() => {
    if (!open) return;
    const away = (event: Event) => {
      const target = event.target as Node;
      if (!list.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const moved = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [open]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      if (!open) show();
      else setActive(Math.max(0, Math.min(last, to)));
    };
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active - 1);
    else if (event.key === "Home" && open) move(0);
    else if (event.key === "End" && open) move(last);
    else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      if (options[active]) choose(options[active].value);
    } else if (event.key === "Escape" && open) {
      // Closes the list only, not the dialog the field sits in.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
    else if (event.key.length === 1 && /\S/.test(event.key)) {
      // A letter or digit jumps to the next option starting with it.
      const key = event.key.toLowerCase();
      const from = open ? active : options.findIndex((o) => o.value === current);
      for (let step = 1; step <= options.length; step++) {
        const at = (from + step) % options.length;
        if (options[at].label.toLowerCase().startsWith(key)) {
          if (open) setActive(at);
          else choose(options[at].value);
          break;
        }
      }
    }
  };

  return (
    <span className="select">
      <button
        type="button"
        ref={button}
        className={`select-button${current === "" ? " empty" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        {chosen?.label ?? ""}
      </button>
      {/* What the form submits and validates. Invisible, but not hidden:
          a hidden input is never checked for `required`. */}
      {name !== undefined && (
        <input
          className="select-field"
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          value={current}
          required={required}
          onChange={() => {}}
          onFocus={() => button.current?.focus()}
        />
      )}
      {open && (
        <ul className="select-list" role="listbox" id={id} ref={list} aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === current}
              className={i === active ? "active" : undefined}
              onPointerEnter={() => setActive(i)}
              onClick={(event) => {
                // Inside a label, the click would otherwise pass on to the
                // button and open the list again.
                event.preventDefault();
                choose(o.value);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
