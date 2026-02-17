const gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function ts(): string {
  return gray(new Date().toISOString().slice(11, 23));
}

function tag(label: string): string {
  return cyan(`[${label}]`);
}

export const log = {
  info(label: string, msg: string) {
    console.log(`${ts()} ${tag(label)} ${msg}`);
  },
  warn(label: string, msg: string) {
    console.log(`${ts()} ${tag(label)} ${yellow(msg)}`);
  },
  error(label: string, msg: string) {
    console.log(`${ts()} ${tag(label)} ${red(msg)}`);
  },
};
