import { buildApp } from "./app.js";
import { SqliteStateStore } from "./sqlite-store.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const app = await buildApp({ store: new SqliteStateStore(process.env.OTTE_SQLITE_PATH) });

await app.listen({ port, host });
