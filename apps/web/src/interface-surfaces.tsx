import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { exitCleanupMs, interfaceMotionReduced, useInterfacePresence } from "./interface-presence.js";

export function InterfaceSurface({ open, render }: { open: boolean; render(closing: boolean): ReactNode }) {
  const { mounted, closing } = useInterfacePresence(open);
  const lastOpenRender = useRef(render);
  useLayoutEffect(() => { if (open) lastOpenRender.current = render; }, [open, render]);
  return mounted ? (closing ? lastOpenRender.current : render)(closing) : null;
}

export function InspectorPanelContent({ tab, children }: { tab: string; children: ReactNode }) {
  const previous = useRef({ tab, children });
  const [leaving, setLeaving] = useState<typeof previous.current>();
  const changed = previous.current.tab !== tab;
  const outgoing = interfaceMotionReduced() ? undefined : changed ? previous.current : leaving;
  useLayoutEffect(() => {
    const prior = previous.current;
    previous.current = { tab, children };
    if (prior.tab !== tab) setLeaving(interfaceMotionReduced() ? undefined : prior);
  }, [tab, children]);
  useLayoutEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(undefined), exitCleanupMs);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const views = outgoing && outgoing.tab !== tab ? [{ tab, children }, outgoing] : [{ tab, children }];
  return <div className="inspector-content-stage">
    {views.map((view) => {
      const closing = view.tab !== tab;
      return <div key={view.tab} className="inspector-panel-content" data-interface-exit={closing || undefined} inert={closing}
        role={closing ? undefined : "tabpanel"} id={closing ? undefined : "inspector-panel-" + view.tab}
        aria-labelledby={closing ? undefined : "inspector-tab-" + view.tab}>
        {view.children}
      </div>;
    })}
  </div>;
}
