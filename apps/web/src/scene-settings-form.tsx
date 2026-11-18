import { useRef, useState, type FormEvent, type ReactNode } from "react";

export function SceneSettingsForm(props: {
  sceneName: string;
  onSave(form: HTMLFormElement): Promise<void>;
  onError(error: unknown): void;
  children: ReactNode;
}) {
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      await props.onSave(event.currentTarget);
    } catch (error) {
      props.onError(error);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <form className="account-box" aria-label={`Edit scene ${props.sceneName}`} aria-busy={saving} onSubmit={submit}>
    <fieldset disabled={saving} style={{ display: "contents" }}>{props.children}</fieldset>
  </form>;
}
