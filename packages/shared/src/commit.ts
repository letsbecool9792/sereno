/// A signed git commit split the way SshAccount.executeCommit wants it: the signed bytes are
/// `headers + "\n" + message`, where `headers` excludes the gpgsig header.
export interface SignedCommit {
  headers: string;
  message: string;
  /// Armored SSH signature (from the gpgsig header).
  signature: string;
}

/// From `git cat-file commit <rev>` output.
export function parseCommitObject(raw: string): SignedCommit {
  const split = raw.indexOf("\n\n");
  if (split < 0) throw new Error("not a commit object");
  const headerLines = raw.slice(0, split + 1).split(/(?<=\n)/);
  const kept: string[] = [];
  const sig: string[] = [];
  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i]!;
    if (line.startsWith("gpgsig ")) {
      sig.push(line.slice("gpgsig ".length));
      while (headerLines[i + 1]?.startsWith(" ")) sig.push(headerLines[++i]!.slice(1));
    } else {
      kept.push(line);
    }
  }
  if (sig.length === 0) throw new Error("commit is not signed");
  return { headers: kept.join(""), message: raw.slice(split + 2), signature: sig.join("") };
}

/// From GitHub's API (`GET /repos/{owner}/{repo}/commits/{sha}` → commit.verification): `payload` is exactly the
/// signed bytes and `signature` the armored SSHSIG.
export function fromGithubVerification(payload: string, signature: string): SignedCommit {
  const split = payload.indexOf("\n\n");
  if (split < 0) throw new Error("not a commit payload");
  return { headers: payload.slice(0, split + 1), message: payload.slice(split + 2), signature };
}
