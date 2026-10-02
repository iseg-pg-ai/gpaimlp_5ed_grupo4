"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { T, useTranslated } from "@/components/LocaleProvider";

export function ResponsiveNavigation({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useTranslated("Recent Journeys");
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const resize = () => {
      if (desktop.matches && open) onClose();
    };
    desktop.addEventListener("change", resize);
    resize();
    return () => desktop.removeEventListener("change", resize);
  }, [open, onClose]);
  return (
    <>
      <div className="hidden lg:block h-full shrink-0 overflow-auto [&>div]:flex [&>div]:min-h-full [&_aside]:h-auto">
        {children}
      </div>
      <dialog
        ref={dialog}
        id="trip-navigation"
        aria-label={title}
        className="trip-drawer"
        onCancel={onClose}
        onClose={onClose}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX > bounds.right || event.clientX < bounds.left) onClose();
        }}
      >
        <div className="flex items-center justify-between gap-3 p-3 border-b">
          <span className="text-sm font-semibold">{title}</span>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="min-h-11 px-3 rounded border bg-white"
          >
            <T text="Done" /> <span aria-hidden="true">×</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </dialog>
    </>
  );
}
