// On-demand key sync queue. Anyone may ask for a GitHub user's keys to be synced on-chain (it only mirrors GitHub, so
// there's nothing to abuse beyond our gas, which the per-user cooldown bounds). A sync worker
// (packages/ops/src/sync-worker.ts) that holds the CRE login and an allowlisted broadcaster key pulls the jobs,
// runs the Chainlink CRE workflow for each user and reports back. While we run on CRE *simulation*, that worker is a
// machine of ours; deployed on the DON, the workflow's HTTP trigger would take these requests directly.
//
//   POST /sync {login}                       anyone; queues the user               → { githubId, login, state }
//   GET  /sync/status/<githubId>             anyone                                → { state, at, detail }
//   GET  /sync/next     (Authorization: Bearer SYNC_WORKER_TOKEN)  worker takes jobs → [{ githubId, login }]
//   POST /sync/done     (same auth) {githubId, ok, detail}         worker reports
import { timingSafeEqual } from "node:crypto";
import { githubUser } from "@sereno/shared";
import { RelayError } from "./relay";

type State = "queued" | "running" | "done" | "failed";
interface Job {
  githubId: string;
  login: string;
  state: State;
  at: number;
  detail?: string;
}

const COOLDOWN_MS = Number(process.env.SYNC_COOLDOWN_MS ?? 60_000);
const STALE_MS = 15 * 60_000; // a job a worker took and never reported goes back in the queue

export function makeSyncQueue(workerToken: string | undefined, githubToken: string | undefined) {
  const jobs = new Map<string, Job>();
  let workerSeen = 0;

  const authorized = (req: Request) => {
    if (!workerToken) return false;
    const got = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
    const want = Buffer.from(workerToken);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  return {
    enabled: !!workerToken,
    /// Seconds since a worker last asked for jobs (null if never), so clients can say whether syncs are being served.
    workerAge: () => (workerSeen ? Math.round((Date.now() - workerSeen) / 1000) : null),

    async request(login: string) {
      if (!workerToken) throw new RelayError(503, "on-demand key sync isn't enabled on this relayer");
      if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login ?? "")) throw new RelayError(400, "bad GitHub username");
      const u = await githubUser(login, githubToken);
      const id = u.id.toString();
      const j = jobs.get(id);
      const busy = j && (j.state === "queued" || j.state === "running");
      const recent = j && j.state === "done" && Date.now() - j.at < COOLDOWN_MS;
      if (!busy && !recent) jobs.set(id, { githubId: id, login: u.login, state: "queued", at: Date.now() });
      return { ...jobs.get(id)!, workerAge: this.workerAge() };
    },

    status(id: string) {
      return jobs.get(id) ?? { githubId: id, state: "unknown" };
    },

    next(req: Request) {
      if (!authorized(req)) throw new RelayError(401, "worker token required");
      workerSeen = Date.now();
      const out: { githubId: string; login: string }[] = [];
      for (const j of jobs.values()) {
        if (j.state === "queued" || (j.state === "running" && Date.now() - j.at > STALE_MS)) {
          j.state = "running";
          j.at = Date.now();
          out.push({ githubId: j.githubId, login: j.login });
        }
      }
      return out;
    },

    done(req: Request, body: { githubId?: string; ok?: boolean; detail?: string }) {
      if (!authorized(req)) throw new RelayError(401, "worker token required");
      const j = jobs.get(String(body.githubId));
      if (!j) throw new RelayError(404, "no such job");
      j.state = body.ok ? "done" : "failed";
      j.at = Date.now();
      j.detail = body.detail?.slice(0, 500);
      return j;
    },
  };
}
