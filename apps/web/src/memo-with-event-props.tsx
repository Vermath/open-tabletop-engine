import { memo, useLayoutEffect, useRef, type ComponentType } from "react";

type EventHandler = (...args: never[]) => unknown;

/** Use for panels whose function props are event handlers called after render. */
export function memoWithEventProps<Props extends object>(Component: ComponentType<Props>) {
  const Memoized = memo(Component);

  return function PanelWithStableEvents(props: Props) {
    const committed = useRef(props);
    const handlers = useRef(new Map<keyof Props, EventHandler>());
    useLayoutEffect(() => { committed.current = props; }, [props]);

    const stableProps = { ...props };
    for (const key of Object.keys(props) as (keyof Props)[]) {
      if (typeof props[key] !== "function") continue;
      let handler = handlers.current.get(key);
      if (!handler) {
        handler = (...args) => {
          const current = committed.current[key];
          if (typeof current === "function") return current(...args);
        };
        handlers.current.set(key, handler);
      }
      stableProps[key] = handler as Props[typeof key];
    }

    return <Memoized {...stableProps} />;
  };
}
