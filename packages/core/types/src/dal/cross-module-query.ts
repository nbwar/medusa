import { FilterQuery } from "./utils"

/**
 * Describes a link table connecting the queried root entity to an external table.
 *
 * @internal
 */
export type CrossModuleJoinLink = {
  /**
   * PostgreSQL schema for the link table. Defaults to `public`.
   */
  schema?: string
  /**
   * Link table name.
   */
  table: string
  /**
   * Column on the link table referencing the root entity.
   */
  rootKey: string
  /**
   * Column on the link table referencing the external entity.
   */
  targetKey: string
}

/**
 * Describes an external table that can be filtered or sorted against.
 *
 * @internal
 */
export type CrossModuleJoinTarget = {
  /**
   * PostgreSQL schema for the target table. Defaults to `public`.
   */
  schema?: string
  /**
   * Target table name.
   */
  table: string
  /**
   * Primary key column on the target table. Defaults to `id`.
   */
  primaryKey?: string
  /**
   * Filters applied to the external table.
   */
  filters?: FilterQuery<any>
}

/**
 * Metadata describing how to join and filter/sort against a table outside the module.
 *
 * The join is translated into a correlated `EXISTS` subquery (for filtering)
 * and/or a correlated scalar subquery (for sorting) against the root query,
 * so the root rows are never multiplied and counts stay accurate.
 *
 * Behaviour callers should know about:
 * - Filtering/sorting is executed as hand-built SQL against the target table.
 *   Beyond the soft-delete guards below, no other MikroORM global filters
 *   registered on the target entity are applied automatically (the target
 *   lives in another module and is not a registered entity here). Any extra
 *   scoping a module needs must be encoded into `target.filters`.
 * - Soft-delete guards mirror the root query: soft-deleted links and targets
 *   are excluded unless the query runs with `withDeleted`, in which case
 *   they are included too.
 * - Multiple independent targets are combined with AND by supplying several
 *   root-level join specs (each without an `anchor`).
 * - Multi-hop filters chain joins through `anchor`, correlating a join to a
 *   parent target row rather than the root entity (e.g. customer -> tier ->
 *   functionality). Chains can nest recursively to any depth.
 * - Correlation uses a single primary key column; composite keys are not
 *   supported.
 *
 * @example
 * ```ts
 * {
 *   alias: "customer",
 *   link: {
 *     table: "customer_api_key",
 *     rootKey: "api_key_id",
 *     targetKey: "customer_id",
 *   },
 *   target: {
 *     table: "customer",
 *     filters: { email: "user@example.com" },
 *   },
 * }
 * ```
 *
 * @internal
 */
export type CrossModuleJoinSpec = {
  /**
   * Alias used to reference the external table in order keys (e.g. `customer.email`).
   * Must be unique across the join specs of a single query.
   */
  alias: string
  /**
   * When set, this join is correlated to the target row of the referenced join
   * instead of the root entity. Used for multi-hop filters such as filtering
   * customers by a property of their linked pricing tier's functionality.
   */
  anchor?: string
  link: CrossModuleJoinLink
  target: CrossModuleJoinTarget
}

/**
 * Internal-only query options passed through the DAL layer.
 *
 * @internal
 */
export type InternalQueryOptions = {
  crossModuleJoins?: CrossModuleJoinSpec[]
}
