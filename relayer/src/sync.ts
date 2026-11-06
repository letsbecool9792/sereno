// Jobs that need the Chainlink CRE workflows, served by a worker of ours (packages/ops/src/sync-worker.ts) that holds
// the CRE login and an allowlisted broadcaster key. While our workflows run in CRE *simulation*, a machine of ours has
// to run them; deployed to a DON, each workflow's HTTP trigger would take these requests directly.
//
//  - keys:   copy a GitHub user's SSH keys on-chain (github-keys). It only mirrors GitHub, so anyone may ask; the
//            per-job cooldown bounds our gas.
//  - bounty: ask the github-bounty workflow whether a merged PR closed owner/repo#issue, which settles the bounty on
//            one chain; the relayer then pays the USDC pot out.
//
//   POST /sync {login}                          anyone; queues a key sync          → job
//   GET  /sync/status/<githubId>                anyone                             → job | { state: "unknown" }
//   GET  /sync/next   (Authorization: Bearer SYNC_WORKER_TOKEN)   worker takes jobs → Job[]
//   POST /sync/done   (same auth) {id, ok, detail}                worker reports    → job
import { timingSafeEqual } from "node:crypto";
import { githubUser } from "@sereno/shared";
import { RelayError } from "./relay";

type State = "queued" | "running" | "done" | "failed";
export interface Job {
  id: string;
  kind: "keys" | "bounty";
  state: State;
  at: number;
  detail?: string;
  /// keys
  githubId?: string;
  login?: string;
  /// bounty
  chainId?: number;
  repo?: string;
  issue?: string;
  /// bounty: the payout transaction, once paid
  paid?: string;
}

const COOLDOWN_MS = Number(process.env.SYNC_COOLDOWN_MS ?? 60_000);
const STALE_MS = 15 * 60_000; // a job a worker took and never reported goes back in the queue

export const keysJobId = (githubId: string) => githubId;
export const bountyJobId = (chainId: number, repo: string, issue: string) => `bounty:${chainId}:${repo.toLowerCase()}#${issue}`;

export function makeSyncQueue(workerToken: string | undefined, githubToken: string | undefined) {
  const jobs = new Map<string, Job>();
  let workerSeen = 0;

  const authorized = (req: Request) => {
    if (!workerToken) return false;
    const got = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
    const want = Buffer.from(workerToken);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  /// Queues `job` unless the same one is queued, running, or finished within the cooldown. In the last case the
  /// answer carries `cooldown`: the seconds until it can run again (the old "done" is not a fresh run).
  const enqueue = (job: Omit<Job, "state" | "at">): Job & { cooldown?: number } => {
    const j = jobs.get(job.id);
    const busy = j && (j.state === "queued" || j.state === "running");
    const recent = j && j.state === "done" && Date.now() - j.at < COOLDOWN_MS;
    if (recent) return { ...j, cooldown: Math.ceil((COOLDOWN_MS - (Date.now() - j.at)) / 1000) };
    if (!busy) jobs.set(job.id, { ...job, state: "queued", at: Date.now() });
    return jobs.get(job.id)!;
  };

  const queue = {
    enabled: !!workerToken,
    /// Seconds since a worker last asked for jobs (null if never), so clients can say whether jobs are being served.
    workerAge: () => (workerSeen ? Math.round((Date.now() - workerSeen) / 1000) : null),

    async request(login: string) {
      if (!workerToken) throw new RelayError(503, "on-demand key sync isn't enabled on this relayer");
      if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login ?? "")) throw new RelayError(400, "bad GitHub username");
      const u = await githubUser(login, githubToken);
      const id = u.id.toString();
      return { ...enqueue({ id: keysJobId(id), kind: "keys", githubId: id, login: u.login }), workerAge: queue.workerAge() };
    },

    requestBounty(chainId: number, repo: string, issue: string) {
      if (!workerToken) throw new RelayError(503, "bounty settlement isn't enabled on this relayer");
      return { ...enqueue({ id: bountyJobId(chainId, repo, issue), kind: "bounty", chainId, repo: repo.toLowerCase(), issue }), workerAge: queue.workerAge() };
    },

    status(id: string): Job | { id: string; state: "unknown" } {
      return jobs.get(id) ?? { id, state: "unknown" };
    },

    next(req: Request): Job[] {
      if (!authorized(req)) throw new RelayError(401, "worker token required");
      workerSeen = Date.now();
      const out: Job[] = [];
      for (const j of jobs.values()) {
        if (j.state === "queued" || (j.state === "running" && Date.now() - j.at > STALE_MS)) {
          j.state = "running";
          j.at = Date.now();
          out.push(j);
        }
      }
      return out;
    },

    /// `id` (or, from older workers, `githubId`) names the job.
    done(req: Request, body: { id?: string; githubId?: string; ok?: boolean; detail?: string }): Job {
      if (!authorized(req)) throw new RelayError(401, "worker token required");
      const j = jobs.get(String(body.id ?? body.githubId));
      if (!j) throw new RelayError(404, "no such job");
      j.state = body.ok ? "done" : "failed";
      j.at = Date.now();
      j.detail = body.detail?.slice(0, 500);
      return j;
    },
  };
  return queue;
}
