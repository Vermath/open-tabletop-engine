import { memo, useLayoutEffect, useRef, type ComponentType } from "react";

type EventHandler = (...args: never[]) => unknown;
type EventPropKeys<Props> = {
  [Key in keyof Props]-?: NonNullable<Props[Key]> extends EventHandler ? Key : never;
}[keyof Props];

/** Only list callbacks invoked in response to events. Render functions keep their normal identity. */
export function memoWithEventProps<Props extends object>(Component: ComponentType<Props>, eventProps: readonly EventPropKeys<Props>[]) {
  const Memoized = memo(Component);

  return function PanelWithStableEvents(props: Props) {
    const committed = useRef(props);
    const handlers = useRef(new Map<keyof Props, EventHandler>());
    useLayoutEffect(() => { committed.current = props; }, [props]);

    const stableProps = { ...props };
    for (const key of eventProps) {
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
