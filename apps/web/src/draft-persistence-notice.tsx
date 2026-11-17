export type DraftPersistenceStatus = "idle" | "saved" | "failed";

export function draftPersistenceStatus(written: boolean): DraftPersistenceStatus {
  return written ? "saved" : "failed";
}

export function DraftPersistenceNotice(props: {
  subject: "Handout" | "Journal" | "Journal edit";
  status: DraftPersistenceStatus;
}) {
  if (props.status === "idle") return null;
  if (props.status === "failed") {
    return (
      <p className="creator-error" role="alert">
        {props.subject} draft is only in this open editor. Browser storage is unavailable; save it to the campaign before closing.
      </p>
    );
  }
  return <p className="panel-success" role="status">{props.subject} draft saved in this browser.</p>;
}
