import { PGlite } from "@electric-sql/pglite";
const c = new PGlite("./.data/pglite");
const r = await c.query("select customer_id, array_agg(id order by id) ids from extinguisher_assets group by customer_id order by customer_id limit 2");
console.log(JSON.stringify(r.rows));
