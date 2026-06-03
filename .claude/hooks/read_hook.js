const ENV_PATTERN = /(?:^|[/\\])\.env(?![.\w])/;

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const toolArgs = JSON.parse(Buffer.concat(chunks).toString());
  const input = toolArgs.tool_input ?? {};

  const isBash = toolArgs.tool_name === "Bash";

  const blocked = isBash
    ? ENV_PATTERN.test(input.command ?? "")
    : [input.file_path, input.path, input.pattern]
        .filter(Boolean)
        .some((p) => ENV_PATTERN.test(p));

  if (blocked) {
    process.stdout.write(
      JSON.stringify({
        continue: false,
        stopReason: "Blocked: accessing .env files is not permitted.",
      })
    );
    process.exit(0);
  }
}

main();
