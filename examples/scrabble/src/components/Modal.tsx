import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import "./Modal.css";

interface ModalProps {
  open: boolean;
  title?: string;
  titleClassName?: string;
  ariaLabel?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Modal({
  open,
  title,
  titleClassName,
  ariaLabel,
  onClose,
  children,
  footer,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="wwz-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="wwz-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel || "Dialog"}
      >
        <div
          className={`wwz-modal-header ${title ? "" : "wwz-modal-header--solo"}`}
        >
          {title && (
            <h2
              className={`wwz-modal-title ${titleClassName || ""}`}
              id={titleId}
            >
              {title}
            </h2>
          )}
          <button
            className="wwz-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        {children && <div className="wwz-modal-body">{children}</div>}
        {footer && <div className="wwz-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
