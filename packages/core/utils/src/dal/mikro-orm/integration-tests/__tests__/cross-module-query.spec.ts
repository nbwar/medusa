import {
  BeforeCreate,
  Entity,
  MikroORM,
  OnInit,
  PrimaryKey,
  Property,
} from "@medusajs/deps/mikro-orm/core"
import {
  defineConfig,
  SqlEntityManager,
} from "@medusajs/deps/mikro-orm/postgresql"
import { dropDatabase } from "pg-god"
import { mikroOrmBaseRepositoryFactory } from "../../mikro-orm-repository"
import { augmentFindOptionsWithCrossModuleJoins } from "../../cross-module-query"
import { MedusaInternalService } from "../../../../modules-sdk/medusa-internal-service"
import { buildQuery } from "../../../../modules-sdk/build-query"
import { getDatabaseURL, pgGodCredentials } from "../__fixtures__/database"

jest.setTimeout(300000)

const dbName = "mikroorm-cross-module-customer-pricing-tier"

@Entity()
class CustomerEntity {
  @PrimaryKey()
  id: string

  @Property()
  email: string

  @Property({ nullable: true })
  deleted_at: Date | null

  @OnInit()
  @BeforeCreate()
  onInit() {
    if (!this.id) {
      this.id = Math.random().toString(36).substring(7)
    }
  }
}

@Entity()
class PricingTierEntity {
  @PrimaryKey()
  id: string

  @Property()
  handle: string

  @Property({ nullable: true })
  deleted_at: Date | null

  @OnInit()
  @BeforeCreate()
  onInit() {
    if (!this.id) {
      this.id = Math.random().toString(36).substring(7)
    }
  }
}

const CustomerEntityRepository = mikroOrmBaseRepositoryFactory(CustomerEntity)
const CustomerEntityInternalService = MedusaInternalService(CustomerEntity)
const PricingTierEntityRepository =
  mikroOrmBaseRepositoryFactory(PricingTierEntity)
const PricingTierEntityInternalService =
  MedusaInternalService(PricingTierEntity)

const customersSeed = [
  { id: "cust_a", email: "alice@example.com" },
  { id: "cust_b", email: "bob@example.com" },
  { id: "cust_c", email: "charlie@example.com" },
]

const pricingTiersSeed = [
  { id: "tier_standard", handle: "standard" },
  { id: "tier_premium", handle: "premium" },
]

const customerPricingTierLinksSeed = [
  { id: "link_1", customer_id: "cust_a", pricing_tier_id: "tier_premium" },
  { id: "link_2", customer_id: "cust_b", pricing_tier_id: "tier_standard" },
  { id: "link_3", customer_id: "cust_c", pricing_tier_id: "tier_premium" },
]

const regionsSeed = [
  { id: "reg_eu", code: "eu" },
  { id: "reg_us", code: "us" },
]

const customerRegionLinksSeed = [
  { id: "region_link_1", customer_id: "cust_a", region_id: "reg_eu" },
  { id: "region_link_2", customer_id: "cust_b", region_id: "reg_eu" },
  { id: "region_link_3", customer_id: "cust_c", region_id: "reg_us" },
]

const functionalitiesSeed = [
  { id: "func_billing", handle: "billing", enabled: true },
  { id: "func_analytics", handle: "analytics", enabled: true },
]

const tierFunctionalityLinksSeed = [
  {
    id: "func_link_1",
    pricing_tier_id: "tier_premium",
    functionality_id: "func_billing",
  },
  {
    id: "func_link_2",
    pricing_tier_id: "tier_standard",
    functionality_id: "func_analytics",
  },
]

async function createLinkTable(manager: SqlEntityManager) {
  const knex = manager.getKnex()

  await knex.schema.createTable("customer_pricing_tier_link", (table) => {
    table.text("id").primary()
    table.text("customer_id").notNullable()
    table.text("pricing_tier_id").notNullable()
    table.timestamps(true, true)
    table.timestamp("deleted_at", { useTz: true }).nullable()
  })

  await knex.schema.createTable("region_entity", (table) => {
    table.text("id").primary()
    table.text("code").notNullable()
    table.timestamps(true, true)
    table.timestamp("deleted_at", { useTz: true }).nullable()
  })

  await knex.schema.createTable("customer_region_link", (table) => {
    table.text("id").primary()
    table.text("customer_id").notNullable()
    table.text("region_id").notNullable()
    table.timestamps(true, true)
    table.timestamp("deleted_at", { useTz: true }).nullable()
  })

  await knex.schema.createTable("functionality_entity", (table) => {
    table.text("id").primary()
    table.text("handle").notNullable()
    table.boolean("enabled").notNullable()
    table.timestamps(true, true)
    table.timestamp("deleted_at", { useTz: true }).nullable()
  })

  await knex.schema.createTable("tier_functionality_link", (table) => {
    table.text("id").primary()
    table.text("pricing_tier_id").notNullable()
    table.text("functionality_id").notNullable()
    table.timestamps(true, true)
    table.timestamp("deleted_at", { useTz: true }).nullable()
  })
}

async function seedLinkTable(manager: SqlEntityManager) {
  const knex = manager.getKnex()
  const now = new Date()

  await knex("customer_pricing_tier_link").insert(
    customerPricingTierLinksSeed.map((link) => ({
      ...link,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }))
  )

  await knex("region_entity").insert(
    regionsSeed.map((region) => ({
      ...region,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }))
  )

  await knex("customer_region_link").insert(
    customerRegionLinksSeed.map((link) => ({
      ...link,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }))
  )

  await knex("functionality_entity").insert(
    functionalitiesSeed.map((functionality) => ({
      ...functionality,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }))
  )

  await knex("tier_functionality_link").insert(
    tierFunctionalityLinksSeed.map((link) => ({
      ...link,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }))
  )
}

function buildRegionJoinMetadata(filters?: Record<string, unknown>) {
  return {
    alias: "region",
    link: {
      table: "customer_region_link",
      rootKey: "customer_id",
      targetKey: "region_id",
    },
    target: {
      table: "region_entity",
      filters,
    },
  }
}

function buildPricingTierJoinMetadata(filters?: Record<string, unknown>) {
  return {
    alias: "pricing_tier",
    link: {
      table: "customer_pricing_tier_link",
      rootKey: "customer_id",
      targetKey: "pricing_tier_id",
    },
    target: {
      table: "pricing_tier_entity",
      filters,
    },
  }
}

function buildFunctionalityJoinMetadata(filters?: Record<string, unknown>) {
  return {
    alias: "functionality",
    anchor: "pricing_tier",
    link: {
      table: "tier_functionality_link",
      rootKey: "pricing_tier_id",
      targetKey: "functionality_id",
    },
    target: {
      table: "functionality_entity",
      filters,
    },
  }
}

function buildCustomerJoinMetadata(filters?: Record<string, unknown>) {
  return {
    alias: "customer",
    link: {
      table: "customer_pricing_tier_link",
      rootKey: "pricing_tier_id",
      targetKey: "customer_id",
    },
    target: {
      table: "customer_entity",
      filters,
    },
  }
}

describe("cross-module query integration", () => {
  let orm!: MikroORM
  let manager!: SqlEntityManager
  let customerService: InstanceType<typeof CustomerEntityInternalService>
  let pricingTierService: InstanceType<typeof PricingTierEntityInternalService>

  const getCustomerRepository = () => {
    return new CustomerEntityRepository({ manager: manager.fork() })
  }

  const getPricingTierRepository = () => {
    return new PricingTierEntityRepository({ manager: manager.fork() })
  }

  beforeEach(async () => {
    await dropDatabase(
      { databaseName: dbName, errorIfNonExist: false },
      pgGodCredentials
    )

    orm = await MikroORM.init(
      defineConfig({
        entities: [CustomerEntity, PricingTierEntity],
        clientUrl: getDatabaseURL(dbName),
      })
    )

    const generator = orm.getSchemaGenerator()
    await generator.ensureDatabase()
    await generator.createSchema()

    manager = orm.em.fork() as unknown as SqlEntityManager

    await createLinkTable(manager)
    await seedLinkTable(manager)

    await getCustomerRepository().create(customersSeed, { manager })
    await getPricingTierRepository().create(pricingTiersSeed, { manager })
    await manager.flush()

    customerService = new CustomerEntityInternalService({
      customerEntityRepository: getCustomerRepository(),
    })

    pricingTierService = new PricingTierEntityInternalService({
      pricingTierEntityRepository: getPricingTierRepository(),
    })
  })

  afterEach(async () => {
    const knex = manager.getKnex()
    await knex.schema.dropTableIfExists("tier_functionality_link")
    await knex.schema.dropTableIfExists("functionality_entity")
    await knex.schema.dropTableIfExists("customer_region_link")
    await knex.schema.dropTableIfExists("region_entity")
    await knex.schema.dropTableIfExists("customer_pricing_tier_link")

    const generator = orm.getSchemaGenerator()
    await generator.dropSchema()
    await orm.close(true)
  })

  describe("listing customers filtered by pricing tier", () => {
    it("should filter customers by linked pricing tier handle", async () => {
      const config = {
        __internal: { crossModuleJoins:[
          buildPricingTierJoinMetadata({ handle: "premium" }),
        ],
},
      }

      const augmented = augmentFindOptionsWithCrossModuleJoins(
        buildQuery({}, config),
        { entityName: "CustomerEntity", primaryKey: "id" }
      )
      const sql = manager
        .createQueryBuilder(CustomerEntity)
        .where(augmented.where as any)
        .getQuery()

      expect(sql).toMatch(
        /from "customer_entity" as "c0" where exists \(select 1 from "public"\."customer_pricing_tier_link"/
      )
      expect(sql).toMatch(/"pricing_tier"\."handle" = \$1/)
      expect(sql).toMatch(/"deleted_at" is null/)

      const results = await customerService.list({}, config, { manager })

      expect(results.map((row: any) => row.id).sort()).toEqual(["cust_a", "cust_c"])
    })

    it("should combine customer filters with pricing tier filters", async () => {
      const results = await customerService.list(
        { email: "bob@example.com" },
        {
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata({ handle: "standard" }),
          ],
},
        },
        { manager }
      )

      expect(results).toHaveLength(1)
      expect((results[0] as any).id).toBe("cust_b")
    })

    it("should sort customers by linked pricing tier handle", async () => {
      const config = {
        __internal: { crossModuleJoins:[buildPricingTierJoinMetadata()],
},
        order: {
          "pricing_tier.handle": "ASC",
        },
      }

      const augmented = augmentFindOptionsWithCrossModuleJoins(
        buildQuery({}, config),
        { entityName: "CustomerEntity", primaryKey: "id" }
      )
      const sql = manager
        .createQueryBuilder(CustomerEntity)
        .where(augmented.where as any)
        .orderBy(augmented.options?.orderBy as any)
        .getQuery()

      expect(sql).toMatch(
        /order by \(select "pricing_tier"\."handle" from "public"\."customer_pricing_tier_link" as "cm_order_link_0"/
      )
      expect(sql).toMatch(/order by "pricing_tier"\."id" limit 1\) asc$/)

      const results = await customerService.list({}, config, { manager })

      expect(results.map((row: any) => row.id)).toEqual([
        "cust_a",
        "cust_c",
        "cust_b",
      ])
    })

    it("should return a correct count via listAndCount (raw fragment survives both queries)", async () => {
      const config = {
        __internal: { crossModuleJoins:[
          buildPricingTierJoinMetadata({ handle: "premium" }),
        ],
},
      }

      const augmented = augmentFindOptionsWithCrossModuleJoins(
        buildQuery({}, config),
        { entityName: "CustomerEntity", primaryKey: "id" }
      )
      const countSql = manager
        .createQueryBuilder(CustomerEntity)
        .count()
        .where(augmented.where as any)
        .getQuery()

      expect(countSql).toMatch(/^select count\(\*\)/)
      expect(countSql).toMatch(/where exists \(select 1 from "public"\."customer_pricing_tier_link"/)
      expect(countSql).toMatch(/"pricing_tier"\."handle" = \$1/)

      const [results, count] = await customerService.listAndCount({}, config, {
        manager,
      })

      expect(count).toBe(2)
      expect(results.map((row: any) => row.id).sort()).toEqual(["cust_a", "cust_c"])
    })

    it("should not multiply rows when multiple links match (exists semantics)", async () => {
      const knex = manager.getKnex()
      const now = new Date()

      // A second premium tier, with cust_a linked to BOTH premium tiers.
      await getPricingTierRepository().create(
        [{ id: "tier_premium_2", handle: "premium" }],
        { manager }
      )
      await manager.flush()
      await knex("customer_pricing_tier_link").insert({
        id: "link_dup",
        customer_id: "cust_a",
        pricing_tier_id: "tier_premium_2",
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })

      const [results, count] = await customerService.listAndCount(
        {},
        {
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata({ handle: "premium" }),
          ],
},
        },
        { manager }
      )

      // cust_a has two matching links but must appear exactly once.
      expect(count).toBe(2)
      expect(results.map((row: any) => row.id).sort()).toEqual(["cust_a", "cust_c"])
    })

    it("should honor pagination together with a cross-module filter", async () => {
      const [results, count] = await customerService.listAndCount(
        {},
        {
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata({ handle: "premium" }),
          ],
},
          order: { id: "ASC" },
          take: 1,
          skip: 1,
        },
        { manager }
      )

      // Total matching (premium) is 2; page returns only the second one.
      expect(count).toBe(2)
      expect(results.map((row: any) => row.id)).toEqual(["cust_c"])
    })

    it("should exclude rows whose link row is soft-deleted", async () => {
      const knex = manager.getKnex()
      await knex("customer_pricing_tier_link")
        .where({ id: "link_1" })
        .update({ deleted_at: new Date() })

      const results = await customerService.list(
        {},
        {
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata({ handle: "premium" }),
          ],
},
        },
        { manager }
      )

      // cust_a's premium link is soft-deleted; only cust_c remains.
      expect(results.map((row: any) => row.id)).toEqual(["cust_c"])
    })

    it("should exclude rows whose target row is soft-deleted", async () => {
      const knex = manager.getKnex()
      await knex("pricing_tier_entity")
        .where({ id: "tier_premium" })
        .update({ deleted_at: new Date() })

      const results = await customerService.list(
        {},
        {
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata({ handle: "premium" }),
          ],
},
        },
        { manager }
      )

      // The only premium tier is soft-deleted, so no customers match.
      expect(results).toHaveLength(0)
    })

    it("should include soft-deleted links when the query uses withDeleted", async () => {
      const knex = manager.getKnex()
      await knex("customer_pricing_tier_link")
        .where({ id: "link_1" })
        .update({ deleted_at: new Date() })

      const withoutDeleted = await customerService.list(
        {},
        {
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata({ handle: "premium" }),
          ],
},
        },
        { manager }
      )
      expect(withoutDeleted.map((row: any) => row.id)).toEqual(["cust_c"])

      const withDeletedConfig = {
        withDeleted: true,
        __internal: { crossModuleJoins:[
          buildPricingTierJoinMetadata({ handle: "premium" }),
        ],
},
      }
      const augmented = augmentFindOptionsWithCrossModuleJoins(
        buildQuery({}, withDeletedConfig),
        { entityName: "CustomerEntity", primaryKey: "id" }
      )
      const withDeletedSql = manager
        .createQueryBuilder(CustomerEntity)
        .where(augmented.where as any)
        .getQuery()

      expect(withDeletedSql).not.toMatch(/deleted_at/)
      expect(withDeletedSql).toMatch(/"pricing_tier"\."handle" = \$1/)

      const withDeleted = await customerService.list(
        {},
        withDeletedConfig,
        { manager }
      )

      // withDeleted mirrors down into the join: the soft-deleted link is
      // considered again, so cust_a matches consistently with the root query.
      expect(withDeleted.map((row: any) => row.id).sort()).toEqual([
        "cust_a",
        "cust_c",
      ])
    })

    it("should include soft-deleted targets when the query uses withDeleted", async () => {
      const knex = manager.getKnex()
      await knex("pricing_tier_entity")
        .where({ id: "tier_premium" })
        .update({ deleted_at: new Date() })

      const withDeleted = await customerService.list(
        {},
        {
          withDeleted: true,
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata({ handle: "premium" }),
          ],
},
        },
        { manager }
      )

      expect(withDeleted.map((row: any) => row.id).sort()).toEqual([
        "cust_a",
        "cust_c",
      ])
    })
  })

  describe("multi-target and nested cross-module filters", () => {
    it("should filter customers by multiple independent targets with AND semantics", async () => {
      const config = {
        __internal: { crossModuleJoins:[
          buildPricingTierJoinMetadata({ handle: "premium" }),
          buildRegionJoinMetadata({ code: "eu" }),
        ],
},
      }

      const augmented = augmentFindOptionsWithCrossModuleJoins(
        buildQuery({}, config),
        { entityName: "CustomerEntity", primaryKey: "id" }
      )
      const sql = manager
        .createQueryBuilder(CustomerEntity)
        .where(augmented.where as any)
        .getQuery()

      expect(sql).toMatch(/"pricing_tier"\."handle" = \$1/)
      expect(sql).toMatch(/"region"\."code" = \$2/)
      expect(sql.match(/exists \(select 1 from/g)?.length).toBe(2)

      const results = await customerService.list({}, config, { manager })

      expect(results.map((row: any) => row.id)).toEqual(["cust_a"])
    })

    it("should filter customers by a nested target through an anchored join", async () => {
      const config = {
        __internal: { crossModuleJoins:[
          buildPricingTierJoinMetadata(),
          buildFunctionalityJoinMetadata({ handle: "billing" }),
        ],
},
      }

      const augmented = augmentFindOptionsWithCrossModuleJoins(
        buildQuery({}, config),
        { entityName: "CustomerEntity", primaryKey: "id" }
      )
      const sql = manager
        .createQueryBuilder(CustomerEntity)
        .where(augmented.where as any)
        .getQuery()

      expect(sql).toMatch(
        /exists \(select 1 from "public"\."customer_pricing_tier_link"/
      )
      expect(sql).toMatch(
        /exists \(select 1 from "public"\."tier_functionality_link"/
      )
      expect(sql).toMatch(
        /"cm_link_1"\."pricing_tier_id" = "pricing_tier"\."id"/
      )
      expect(sql).toMatch(/"functionality"\."handle" = \$1/)
      expect(sql.match(/exists \(select 1 from/g)?.length).toBe(2)

      const results = await customerService.list({}, config, { manager })

      expect(results.map((row: any) => row.id).sort()).toEqual([
        "cust_a",
        "cust_c",
      ])
    })

    it("should combine parent and nested target filters in a single exists clause", async () => {
      const config = {
        __internal: { crossModuleJoins:[
          buildPricingTierJoinMetadata({ handle: "premium" }),
          buildFunctionalityJoinMetadata({ handle: "billing" }),
        ],
},
      }

      const results = await customerService.list({}, config, { manager })

      expect(results.map((row: any) => row.id).sort()).toEqual([
        "cust_a",
        "cust_c",
      ])
    })

    it("should combine multiple root filters with a nested filter", async () => {
      const config = {
        __internal: { crossModuleJoins:[
          buildPricingTierJoinMetadata({ handle: "premium" }),
          buildRegionJoinMetadata({ code: "eu" }),
          buildFunctionalityJoinMetadata({ handle: "billing" }),
        ],
},
      }

      const results = await customerService.list({}, config, { manager })

      expect(results.map((row: any) => row.id)).toEqual(["cust_a"])
    })

    it("should exclude customers when a nested functionality link is soft-deleted", async () => {
      const knex = manager.getKnex()
      await knex("tier_functionality_link")
        .where({ id: "func_link_1" })
        .update({ deleted_at: new Date() })

      const results = await customerService.list(
        {},
        {
          __internal: { crossModuleJoins:[
            buildPricingTierJoinMetadata(),
            buildFunctionalityJoinMetadata({ handle: "billing" }),
          ],
},
        },
        { manager }
      )

      expect(results).toHaveLength(0)
    })
  })

  describe("listing pricing tiers filtered by customer", () => {
    it("should filter pricing tiers by linked customer email", async () => {
      const config = {
        __internal: { crossModuleJoins:[
          buildCustomerJoinMetadata({ email: "alice@example.com" }),
        ],
},
      }

      const augmented = augmentFindOptionsWithCrossModuleJoins(
        buildQuery({}, config),
        { entityName: "PricingTierEntity", primaryKey: "id" }
      )
      const sql = manager
        .createQueryBuilder(PricingTierEntity)
        .where(augmented.where as any)
        .getQuery()

      expect(sql).toMatch(
        /from "pricing_tier_entity" as "p0" where exists \(select 1 from "public"\."customer_pricing_tier_link"/
      )
      expect(sql).toMatch(/"p0"\."id"/)
      expect(sql).toMatch(/"customer"\."email" = \$1/)

      const results = await pricingTierService.list({}, config, { manager })

      expect(results).toHaveLength(1)
      expect((results[0] as any).id).toBe("tier_premium")
      expect((results[0] as any).handle).toBe("premium")
    })

    it("should combine pricing tier filters with customer filters", async () => {
      const results = await pricingTierService.list(
        { handle: "premium" },
        {
          __internal: { crossModuleJoins:[
            buildCustomerJoinMetadata({ email: "charlie@example.com" }),
          ],
},
        },
        { manager }
      )

      expect(results).toHaveLength(1)
      expect((results[0] as any).id).toBe("tier_premium")
    })

    it("should return pricing tiers linked to any of the given customers", async () => {
      const results = await pricingTierService.list(
        {},
        {
          __internal: { crossModuleJoins:[
            buildCustomerJoinMetadata({
              email: { $in: ["alice@example.com", "bob@example.com"] },
            }),
          ],
},
        },
        { manager }
      )

      expect(results.map((row: any) => row.handle).sort()).toEqual([
        "premium",
        "standard",
      ])
    })

    it("should sort pricing tiers by linked customer email", async () => {
      const results = await pricingTierService.list(
        {},
        {
          __internal: { crossModuleJoins:[buildCustomerJoinMetadata()],
},
          order: {
            "customer.email": "ASC",
          },
        },
        { manager }
      )

      expect(results.map((row: any) => row.id)).toEqual([
        "tier_premium",
        "tier_standard",
      ])
    })
  })
})
