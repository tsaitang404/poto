export function readTomlVar(content, key) {
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\"([^\"]*)\"\\s*$`, "m");
  const match = content.match(re);
  if (!match) {
    return null;
  }
  return match[1] || null;
}

export function readTomlValue(content, regex) {
  const match = content.match(regex);
  return match ? match[1] : null;
}

export function upsertTomlVar(content, key, value) {
  const varLine = `${key} = \"${value}\"`;
  const keyRegex = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\"[^\"]*\"\\s*$`, "m");

  if (keyRegex.test(content)) {
    return content.replace(keyRegex, varLine);
  }

  const varsHeader = /^\[vars\]\s*$/m;
  if (!varsHeader.test(content)) {
    return `${content.trimEnd()}\n\n[vars]\n${varLine}\n`;
  }

  return content.replace(varsHeader, (line) => `${line}\n${varLine}`);
}

export function escapeRegExp(input) {
  return input.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}
