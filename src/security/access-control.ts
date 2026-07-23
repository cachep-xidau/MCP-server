// Access control for the knowledge-base search tool.
//
// The MCP server is provisioned per deployment (one host = one caller identity),
// so the caller's role and permitted document scope are injected via environment
// variables rather than passed on every request:
//
//   RBAC_ROLE             - the caller's role (e.g. "ba", "hr", "admin"). Reserved
//                           for role-aware tool gating; currently informational.
//   ACL_ALLOWED_PROJECTS  - comma-separated project keys the caller may read
//                           (e.g. "AIA,SUZ,AAV"). Empty/unset = no restriction.
//
// ACL is enforced by pre-filtering the SQL query to the permitted project scope,
// so restricted documents never enter the candidate set or the LLM prompt.

export interface AclScope {
  /** Project keys the query must be restricted to. Empty array = unrestricted. */
  projects: string[];
  /** The caller's role, for logging / future role-aware gating. */
  role: string;
}

/** Thrown when a caller requests a project outside their permitted ACL scope. */
export class AclDeniedError extends Error {
  constructor(projectId: string) {
    super(`Access denied: project '${projectId}' is outside your ACL scope.`);
    this.name = "AclDeniedError";
  }
}

const ALLOWED_PROJECTS = (process.env.ACL_ALLOWED_PROJECTS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ROLE = process.env.RBAC_ROLE || "viewer";

/**
 * Resolve the effective project scope for a query.
 *
 * - No requested project  -> the caller's full allowed scope.
 * - Requested project      -> that single project, but only if it is inside the
 *                             allowed scope; otherwise AclDeniedError is thrown.
 *
 * When ACL_ALLOWED_PROJECTS is unset the scope is unrestricted (single-tenant /
 * development default); production deployments should always set it.
 */
export function resolveAclScope(projectId?: string): AclScope {
  if (projectId) {
    if (ALLOWED_PROJECTS.length && !ALLOWED_PROJECTS.includes(projectId)) {
      throw new AclDeniedError(projectId);
    }
    return { projects: [projectId], role: ROLE };
  }
  return { projects: ALLOWED_PROJECTS, role: ROLE };
}
