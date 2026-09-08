import {
  createProductionControlRuntime,
  daemonStartupMessage,
  loadProductionControlConfig,
} from './main.js';

const processDatabaseUrl = process.env.PROCESS_DAEMON_DATABASE_URL;
const deliveryAdminDatabaseUrl = process.env.POSTGRES_URL;
const runtimeConfigPath = process.env.CODEX_CONTROL_RUNTIME_CONFIG;

if (!processDatabaseUrl || !deliveryAdminDatabaseUrl || !runtimeConfigPath) {
  throw new Error(
    'PROCESS_DAEMON_DATABASE_URL, POSTGRES_URL, and CODEX_CONTROL_RUNTIME_CONFIG are required.',
  );
}

void (async () => {
  const config = await loadProductionControlConfig(runtimeConfigPath);
  const daemon = await createProductionControlRuntime(
    processDatabaseUrl,
    deliveryAdminDatabaseUrl,
    config,
  );
  await daemon.start();
  process.stdout.write(
    `${JSON.stringify({
      status: 'ready',
      message: daemonStartupMessage,
      browserOrigin: daemon.browserOrigin,
    })}\n`,
  );

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void daemon.stop().then(
        () => {
          process.exitCode = 0;
        },
        (error: unknown) => {
          process.stderr.write(
            `${error instanceof Error ? error.message : String(error)}\n`,
          );
          process.exitCode = 1;
        },
      );
    });
  }
})().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
