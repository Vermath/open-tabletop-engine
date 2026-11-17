registerCommand("/spark", (context) => {
  const args = context.args.trim() || "arcane sparks flare across the scene";
  const tokenNames = context.permissions.includes("token.read")
    ? context.tokens.map((token) => token.name).join(", ")
    : "";
  return {
    body: `Spark macro: ${args}${tokenNames ? ` near ${tokenNames}` : ""}.`,
    visibility: "public",
  };
});

onEvent("token.moved", async (event, context) => {
  await context.postChatMessage({ body: `A token moved: ${event.targetId}` });
});
