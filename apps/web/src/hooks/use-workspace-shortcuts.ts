import { useEffect, useRef, useState } from "react";
import type { Memo } from "@/api";
import { focusComposerInput } from "@/lib/composer-focus";

/**
 * The workspace-wide keyboard flow (⌘K, /, c, ?, j/k/e/p, Esc) and the three
 * pieces of state it drives: the queued memos the j/k walk steps through, the
 * shortcut cheat sheet, and the spotlight overlay.
 *
 * The document listener reads the memo list it walks and the card handlers it
 * triggers through refs the render body keeps current, so the effect
 * re-subscribes only when the focused index changes. The refs are returned for
 * that assignment.
 */
export function useWorkspaceShortcuts() {
  const [focusedMemoIndex, setFocusedMemoIndex] = useState<number | null>(null);
  const [shortcutsOpen, setShowShortcutsOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const displayedMemosRef = useRef<Memo[]>([]);
  const handleArchiveRef = useRef<(id: string) => void>(() => {});
  const handlePinRef = useRef<(id: string, pinned: boolean) => void>(() => {});

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      // Chorded shortcuts (⌘C copy, ⌘V paste) and shortcuts while a dialog
      // owns the focus must not steal focus back to the composer/search.
      const modalOpen =
        document.querySelector('[role="dialog"][data-state="open"]') !== null;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === "k"
      ) {
        event.preventDefault();
        setSpotlightOpen(true);
        return;
      }
      if (event.key === "/" && !editable && !modalOpen) {
        event.preventDefault();
        setSpotlightOpen(true);
        return;
      }
      // "c" jumps straight into the composer for quick capture.
      if (
        event.key.toLocaleLowerCase() === "c" &&
        !editable &&
        !modalOpen &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (document.getElementById("flaremo-composer-input")) {
          event.preventDefault();
          focusComposerInput();
        }
      }
      // "?" lists the available keyboard shortcuts.
      if (event.key === "?" && !editable && !modalOpen) {
        event.preventDefault();
        setShowShortcutsOpen(true);
      }

      // J/K card keyboard flow when browsing timeline
      if (
        !editable &&
        !modalOpen &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const memosList = displayedMemosRef.current;
        if (event.key === "j" || event.key === "ArrowDown") {
          if (memosList.length === 0) return;
          event.preventDefault();
          setFocusedMemoIndex((prev) => {
            const next =
              prev === null ? 0 : Math.min(memosList.length - 1, prev + 1);
            const memoItem = memosList[next];
            if (memoItem) {
              const el = document.querySelector(
                `[data-memo-id="${memoItem.id || memoItem.name}"]`,
              );
              el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
            return next;
          });
          return;
        }
        if (event.key === "k" || event.key === "ArrowUp") {
          if (memosList.length === 0) return;
          event.preventDefault();
          setFocusedMemoIndex((prev) => {
            const next = prev === null ? 0 : Math.max(0, prev - 1);
            const memoItem = memosList[next];
            if (memoItem) {
              const el = document.querySelector(
                `[data-memo-id="${memoItem.id || memoItem.name}"]`,
              );
              el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
            return next;
          });
          return;
        }
        if (event.key === "e" && focusedMemoIndex !== null) {
          const current = memosList[focusedMemoIndex];
          if (current) {
            event.preventDefault();
            handleArchiveRef.current(current.id || current.name);
          }
          return;
        }
        if (event.key === "p" && focusedMemoIndex !== null) {
          const current = memosList[focusedMemoIndex];
          if (current) {
            event.preventDefault();
            handlePinRef.current(current.id || current.name, !current.pinned);
          }
          return;
        }
        if (event.key === "Escape" && focusedMemoIndex !== null) {
          event.preventDefault();
          setFocusedMemoIndex(null);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedMemoIndex]);

  return {
    displayedMemosRef,
    focusedMemoIndex,
    handleArchiveRef,
    handlePinRef,
    setShowShortcutsOpen,
    setSpotlightOpen,
    shortcutsOpen,
    spotlightOpen,
  };
}
