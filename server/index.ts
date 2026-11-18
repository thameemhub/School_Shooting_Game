import { createGameServer } from "./app";
const server = createGameServer();
const port = Number(process.env.PORT) || 3001;
server.http.listen(port, "0.0.0.0", () =>
  console.log(`Squad Showdown server: http://localhost:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
