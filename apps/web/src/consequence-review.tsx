import type { RulesSupportBoundary } from "@open-tabletop/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useModalAccessibility } from "./modal-accessibility.js";
import { RulesSupportBoundaryNotice } from "./rules-support-boundary.js";

export interface ConsequenceReviewItem {
  label: string;
  value: string;
  detail?: string;
}

export interface ConsequenceReviewSection {
  id: string;
  label: string;
  items: ConsequenceReviewItem[];
}

export interface ConsequenceReviewRequest {
  title: string;
  summary: string;
  source: string;
  sections: ConsequenceReviewSection[];
  boundary?: RulesSupportBoundary;
  blockingIssues?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConsequenceReviewDialog(props: { request: ConsequenceReviewRequest; onConfirm(): void; onCancel(): void }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const dialogRef = useModalAccessibility<HTMLDivElement>(props.onCancel, { initialFocusRef: headingRef });
  const issues = props.request.blockingIssues ?? [];
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onCancel(); }}>
      <div ref={dialogRef} className="modal-dialog consequence-review-dialog" role="dialog" aria-modal="true" aria-labelledby="consequence-review-title" aria-describedby="consequence-review-summary" tabIndex={-1}>
        <header className="operator-heading">
          <div>
            <span className="section-title">Structured consequence review</span>
            <h2 id="consequence-review-title" ref={headingRef} tabIndex={-1}>{props.request.title}</h2>
          </div>
        </header>
        <p id="consequence-review-summary">{props.request.summary}</p>
        <p className="account-summary"><strong>Rule source:</strong> {props.request.source}</p>
        {props.request.boundary && <RulesSupportBoundaryNotice boundary={props.request.boundary} />}
        {issues.length > 0 && (
          <div className="lore-load-state error" role="alert" aria-label="Choices required before commit">
            <strong>Resolve before commit</strong>
            <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        )}
        <div className="consequence-review-sections">
          {props.request.sections.length > 0 ? props.request.sections.map((section) => (
            <section className="operator-section" key={section.id} aria-labelledby={`consequence-section-${section.id}`}>
              <h3 id={`consequence-section-${section.id}`}>{section.label}</h3>
              <dl>
                {section.items.map((item, index) => (
                  <div className="consequence-review-row" key={`${item.label}:${index}`}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}{item.detail && <small>{item.detail}</small>}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )) : <p role="status">No state-changing consequences were returned by the server.</p>}
        </div>
        <footer className="rest-choice-grid" role="group" aria-label="Consequence review decision">
          <button className="ghost-button" type="button" onClick={props.onCancel}>{props.request.cancelLabel ?? "Cancel"}</button>
          <button className="primary-button" type="button" disabled={issues.length > 0} onClick={props.onConfirm}>{props.request.confirmLabel ?? "Commit reviewed consequences"}</button>
        </footer>
      </div>
    </div>
  );
}

export function useConsequenceReview() {
  const [request, setRequest] = useState<ConsequenceReviewRequest>();
  const resolverRef = useRef<((confirmed: boolean) => void) | undefined>(undefined);
  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = undefined;
    setRequest(undefined);
    resolve?.(confirmed);
  }, []);
  const review = useCallback((next: ConsequenceReviewRequest): Promise<boolean> => new Promise((resolve) => {
    resolverRef.current?.(false);
    resolverRef.current = resolve;
    setRequest(next);
  }), []);
  useEffect(() => () => resolverRef.current?.(false), []);
  return {
    review,
    dialog: request ? <ConsequenceReviewDialog request={request} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null
  };
}
