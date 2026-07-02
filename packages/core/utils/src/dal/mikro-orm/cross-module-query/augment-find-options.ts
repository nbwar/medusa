import { CrossModuleJoinSpec, DAL, FindConfigOrder } from "@medusajs/types"
import { isObject, MedusaError } from "../../../common"
import { SoftDeletableFilterKey } from "../mikro-orm-soft-deletable-filter"
import {
  buildExistsFilter,
  joinRequiresFilter,
} from "./filter-sql"
import { DEFAULT_SCHEMA } from "./helpers"
import { transformOrderByForCrossModuleJoins } from "./order-sql"

export type AugmentFindOptionsWithCrossModuleJoinsArgs = {
  entityName: string
  primaryKey?: string
  defaultSchema?: string
}

/**
 * Translates cross-module join metadata into MikroORM-compatible `where` and
 * `orderBy` clauses so callers can keep using `manager.find()` / `findAndCount()`.
 */
export function augmentFindOptionsWithCrossModuleJoins<const T>(
  findOptions: DAL.FindOptions<T>,
  {
    entityName,
    primaryKey = "id",
    defaultSchema = DEFAULT_SCHEMA,
  }: AugmentFindOptionsWithCrossModuleJoinsArgs
): DAL.FindOptions<T> {
  const crossModuleJoins = findOptions.options?.__internal?.crossModuleJoins
  if (!crossModuleJoins?.length) {
    return findOptions
  }

  assertValidCrossModuleJoins(crossModuleJoins)

  const rootAlias = getMikroOrmRootAlias(entityName)
  const withDeleted = resolveWithDeleted(findOptions.options)
  const childrenByAnchor = buildChildrenByAnchor(crossModuleJoins)
  const existsContext = {
    linkAliasCounter: { value: 0 },
    childrenByAnchor,
    defaultSchema,
    withDeleted,
  }

  const options = {
    ...(findOptions.options ?? {}),
  }

  if (options.__internal) {
    const internal = { ...options.__internal }
    delete internal.crossModuleJoins

    if (Object.keys(internal).length) {
      options.__internal = internal
    } else {
      delete options.__internal
    }
  }

  const existsFilters = getRootJoins(crossModuleJoins)
    .filter((joinSpec) => joinRequiresFilter(joinSpec, childrenByAnchor))
    .map((joinSpec) =>
      buildExistsFilter(joinSpec, rootAlias, primaryKey, existsContext)
    )

  let where = {
    ...(findOptions.where ?? {}),
  } as Record<string, unknown>

  if (existsFilters.length) {
    where =
      Object.keys(where).length > 0
        ? {
            $and: [where, ...existsFilters],
          }
        : {
            $and: existsFilters,
          }
  }

  if (options.orderBy) {
    options.orderBy = transformOrderByForCrossModuleJoins(
      options.orderBy as FindConfigOrder | FindConfigOrder[],
      crossModuleJoins,
      primaryKey,
      rootAlias,
      defaultSchema,
      withDeleted
    ) as typeof options.orderBy
  }

  return {
    where: where as DAL.FindOptions<T>["where"],
    options,
  }
}

function assertValidCrossModuleJoins(
  crossModuleJoins: CrossModuleJoinSpec[]
): void {
  assertUniqueAliases(crossModuleJoins)

  const aliases = new Set(crossModuleJoins.map((join) => join.alias))

  for (const join of crossModuleJoins) {
    if (!join.anchor) {
      continue
    }

    if (join.anchor === join.alias) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cross-module join "${join.alias}" cannot anchor to itself.`
      )
    }

    if (!aliases.has(join.anchor)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cross-module join "${join.alias}" references unknown anchor "${join.anchor}".`
      )
    }
  }
}

/**
 * MikroORM's default naming strategy uses the first character of the entity
 * class name plus the alias counter. The root entity in `find()` always uses
 * counter 0 (e.g. CustomerEntity -> "c0", PricingTierEntity -> "p0").
 */
function getMikroOrmRootAlias(entityName: string): string {
  return entityName.charAt(0).toLowerCase() + "0"
}

/**
 * Resolve whether the current query includes soft-deleted rows, mirroring the
 * `softDeletable` MikroORM filter that `buildQuery` sets from `withDeleted`.
 */
function resolveWithDeleted(
  options: DAL.FindOptions<any>["options"] | undefined
): boolean {
  const filters = options?.filters

  if (!isObject(filters)) {
    return false
  }

  const softDeletable = (filters as Record<string, unknown>)[
    SoftDeletableFilterKey
  ]

  return isObject(softDeletable) && (softDeletable as any).withDeleted === true
}

function buildChildrenByAnchor(
  crossModuleJoins: CrossModuleJoinSpec[]
): Map<string, CrossModuleJoinSpec[]> {
  const childrenByAnchor = new Map<string, CrossModuleJoinSpec[]>()

  for (const join of crossModuleJoins) {
    if (!join.anchor) {
      continue
    }

    const siblings = childrenByAnchor.get(join.anchor) ?? []
    siblings.push(join)
    childrenByAnchor.set(join.anchor, siblings)
  }

  return childrenByAnchor
}

function getRootJoins(
  crossModuleJoins: CrossModuleJoinSpec[]
): CrossModuleJoinSpec[] {
  return crossModuleJoins.filter((join) => !join.anchor)
}

function assertUniqueAliases(crossModuleJoins: CrossModuleJoinSpec[]): void {
  const seen = new Set<string>()

  for (const join of crossModuleJoins) {
    if (seen.has(join.alias)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Duplicate cross-module join alias "${join.alias}". Each cross-module join must use a unique alias.`
      )
    }
    seen.add(join.alias)
  }
}
