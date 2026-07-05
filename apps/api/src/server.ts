import { startApiRuntime } from "./runtime.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

await startApiRuntime({ port, host, sqlitePath: process.env.OTTE_SQLITE_PATH, uploadDir: process.env.OTTE_UPLOAD_DIR, pluginRoot: process.env.OTTE_PLUGIN_DIR });
