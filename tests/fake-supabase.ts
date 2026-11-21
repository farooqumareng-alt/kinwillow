// A small in-memory stand-in for the Supabase service client, covering only
// the query-builder calls the release and disclosure code makes.
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private wantSingle = false;
  private returning = false;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select() {
    this.returning = true;
    return this;
  }
  insert(row: Row) {
    this.mode = "insert";
    this.payload = row;
    this.returning = false;
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.payload = patch;
    this.returning = false;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  lte(col: string, value: string) {
    this.filters.push((r) => String(r[col]) <= value);
    return this;
  }
  gt(col: string, value: string) {
    this.filters.push((r) => String(r[col]) > value);
    return this;
  }
  gte(col: string, value: string) {
    this.filters.push((r) => String(r[col]) >= value);
    return this;
  }
  is(col: string, value: null) {
    this.filters.push((r) => (r[col] ?? null) === value);
    return this;
  }
  not(col: string, _op: "is", _value: null) {
    this.filters.push((r) => (r[col] ?? null) !== null);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }

  private run(): { data: unknown; error: { message: string } | null } {
    const rows = (this.db.tables[this.table] ??= []);
    if (this.db.failTables.has(`${this.mode}:${this.table}`)) {
      return { data: null, error: { message: `forced ${this.mode} failure on ${this.table}` } };
    }
    let result: Row[];
    if (this.mode === "insert") {
      const row: Row = { id: randomUUID(), created_at: new Date().toISOString(), ...this.payload };
      if (this.table === "disclosure_packages") {
        row.access_token ??= randomUUID().replace(/-/g, "");
        if (rows.some((r) => r.request_id === row.request_id)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        }
      }
      rows.push(row);
      result = [row];
    } else {
      result = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.mode === "update") result.forEach((r) => Object.assign(r, this.payload));
    }
    if (this.mode !== "select" && !this.returning) return { data: null, error: null };
    if (this.wantSingle) {
      return result.length === 1
        ? { data: { ...result[0] }, error: null }
        : { data: null, error: { message: "expected exactly one row" } };
    }
    return { data: result.map((r) => ({ ...r })), error: null };
  }

  then<A, B>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** e.g. "insert:disclosure_packages" to force that operation to fail. */
  failTables = new Set<string>();
  audit: Row[] = [];
  users: Record<string, { email: string }> = {};

  from(table: string) {
    return new Query(this, table);
  }
  async rpc(name: string, args: Row) {
    if (name === "append_audit") this.audit.push(args);
    return { data: null, error: null };
  }
  auth = {
    admin: {
      getUserById: async (id: string) =>
        this.users[id]
          ? { data: { user: { id, email: this.users[id].email } }, error: null }
          : { data: { user: null }, error: { message: "user not found" } },
    },
  };
}
