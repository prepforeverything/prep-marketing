const RUN_HELP = `Usage:
  npm run browser:run -- --spec path/to/spec.json [--output path/to/report.json]
  node .prepkit/scripts/browser/run-flow.mjs --spec path/to/spec.json [--output path/to/report.json]
`;

const BOOTSTRAP_HELP = `Usage:
  npm run browser:bootstrap-session -- --spec path/to/spec.json [--output path/to/report.json] [--storage-state path/to/state.json]
  node .prepkit/scripts/browser/bootstrap-session.mjs --spec path/to/spec.json [--output path/to/report.json] [--storage-state path/to/state.json]
`;

export function parseArgs(argv, mode) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }

    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  if (!args.help && !args.spec) {
    throw new Error("Missing required --spec argument");
  }

  return args;
}

export function printHelp(mode) {
  const help = mode === "bootstrap" ? BOOTSTRAP_HELP : RUN_HELP;
  process.stdout.write(help);
}
