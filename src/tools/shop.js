/**
 * wp_shop — WooCommerce store management over the wc/v3 REST API.
 *
 * WooCommerce is optional: the plugin loads fine without it and every call
 * raises a localized "not configured" hint until consumer key/secret exist.
 */

import {
  summarizeCoupon,
  summarizeCustomer,
  summarizeOrder,
  summarizeProduct,
  summarizeReview,
  summarizeVariation,
} from "../summaries.js";
import { paginationQuery } from "../wp.js";
import {
  assertDestructive,
  ensureAllowed,
  fail,
  guarded,
  jsonOutput,
  mergeData,
  objectParam,
  ok,
  requireParam,
} from "./common.js";

const RESOURCES = [
  "products",
  "variations",
  "orders",
  "coupons",
  "customers",
  "reviews",
];
const ACTIONS = ["list", "get", "create", "update", "delete", "batch"];

const SUMMARIZE = {
  products: summarizeProduct,
  variations: summarizeVariation,
  orders: summarizeOrder,
  coupons: summarizeCoupon,
  customers: summarizeCustomer,
  reviews: summarizeReview,
};

const WRITABLE = {
  products: [
    "name",
    "type",
    "status",
    "featured",
    "catalog_visibility",
    "description",
    "short_description",
    "sku",
    "regular_price",
    "sale_price",
    "date_on_sale_from",
    "date_on_sale_to",
    "manage_stock",
    "stock_quantity",
    "stock_status",
    "categories",
    "tags",
    "images",
    "attributes",
    "weight",
    "dimensions",
  ],
  variations: [
    "regular_price",
    "sale_price",
    "description",
    "sku",
    "manage_stock",
    "stock_quantity",
    "stock_status",
    "attributes",
    "image",
    "weight",
    "dimensions",
  ],
  orders: [
    "status",
    "customer_id",
    "billing",
    "shipping",
    "line_items",
    "fee_lines",
    "shipping_lines",
    "coupon_lines",
    "payment_method",
    "payment_method_title",
    "set_paid",
    "customer_note",
    "meta_data",
  ],
  coupons: [
    "code",
    "discount_type",
    "amount",
    "description",
    "date_expires",
    "usage_limit",
    "usage_limit_per_user",
    "individual_use",
    "free_shipping",
    "minimum_amount",
    "maximum_amount",
    "product_ids",
    "excluded_product_ids",
    "product_categories",
    "excluded_product_categories",
    "email_restrictions",
  ],
  customers: ["email", "first_name", "last_name", "username", "password", "billing", "shipping", "meta_data"],
  reviews: ["review", "rating", "status"],
};

function basePath(resource, args, i18n) {
  if (resource === "variations") {
    const productId = requireParam(args, "product_id", i18n);
    return `/products/${productId}/variations`;
  }
  if (resource === "reviews") return "/products/reviews";
  return `/${resource}`;
}

function listQuery(resource, args) {
  const common = {
    page: args.page,
    per_page: args.per_page,
    search: args.search,
    orderby: args.orderby,
    order: args.order,
  };
  switch (resource) {
    case "products":
      return {
        ...common,
        status: args.status,
        type: args.type,
        sku: args.sku,
        category: args.category,
        tag: args.tag,
        featured: args.featured,
        stock_status: args.stock_status,
        on_sale: args.on_sale,
      };
    case "orders":
      return {
        ...common,
        status: args.status,
        customer: args.customer,
        product: args.product,
        after: args.after,
        before: args.before,
      };
    case "customers":
      return { ...common, email: args.email, role: args.role };
    case "reviews":
      return { ...common, product: args.product, status: args.status };
    case "variations":
      return { ...common, sku: args.sku, status: args.status };
    default:
      return common;
  }
}

function writeBody(resource, args, i18n) {
  const body = objectParam(args.data, i18n);
  const fields = {};
  for (const field of WRITABLE[resource] ?? []) {
    if (args[field] !== undefined) fields[field] = args[field];
  }
  return mergeData(body, fields);
}

export function shopTool({ client, config, i18n }) {
  return {
    name: "wp_shop",
    description: i18n.t("tool.shop"),
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ACTIONS,
        description:
          "list, get, create, update, delete, or batch (bulk create/update/delete in one request).",
      },
      resource: {
        type: "string",
        required: true,
        enum: RESOURCES,
        description: "products, variations, orders, coupons, customers or reviews.",
      },
      id: { type: "integer", description: "Object id for get, update, delete." },
      product_id: { type: "integer", description: "variations: parent product id (required)." },
      name: { type: "string", description: "products: product name." },
      sku: { type: "string", description: "products/variations: SKU (unique)." },
      regular_price: { type: "string", description: "products/variations: regular price, decimal string." },
      sale_price: { type: "string", description: "products/variations: sale price, decimal string." },
      description: { type: "string", description: "Long description (HTML allowed for products)." },
      short_description: { type: "string", description: "products: short description." },
      status: {
        type: "string",
        description:
          "products: draft|pending|private|publish. orders: pending|processing|on-hold|completed|cancelled|refunded|failed|trash. reviews: approved|hold|spam|trash.",
      },
      type: { type: "string", description: "products: simple|grouped|external|variable." },
      featured: { type: "boolean", description: "products: featured flag." },
      categories: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "products: category objects such as [{id: 12}].",
      },
      tags: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "products: tag objects such as [{id: 3}].",
      },
      images: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "products: images as [{src: 'https://…/image.jpg'}] or [{id: 45}].",
      },
      manage_stock: { type: "boolean", description: "products/variations: manage stock." },
      stock_quantity: { type: "integer", description: "products/variations: stock level." },
      stock_status: { type: "string", description: "instock|outofstock|onbackorder." },
      attributes: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "products/variations: attribute objects.",
      },
      weight: { type: "string", description: "products/variations: weight." },
      dimensions: { type: "object", additionalProperties: true, description: "products: {length,width,height}." },
      customer_id: { type: "integer", description: "orders: customer id (0 for guest)." },
      billing: { type: "object", additionalProperties: true, description: "orders/customers: billing address." },
      shipping: { type: "object", additionalProperties: true, description: "orders/customers: shipping address." },
      line_items: {
        type: "array",
        items: { type: "object", additionalProperties: true },
        description: "orders: line items [{product_id, quantity, variation_id?}].",
      },
      set_paid: { type: "boolean", description: "orders: mark as paid." },
      code: { type: "string", description: "coupons: coupon code." },
      discount_type: { type: "string", description: "coupons: percent|fixed_cart|fixed_product." },
      amount: { type: "string", description: "coupons: discount amount." },
      date_expires: { type: "string", description: "coupons: ISO 8601 expiry date." },
      minimum_amount: { type: "string", description: "coupons: minimum order amount." },
      email: { type: "string", description: "customers: email (list filter or create)." },
      first_name: { type: "string", description: "customers: first name." },
      last_name: { type: "string", description: "customers: last name." },
      rating: { type: "integer", description: "reviews: 1-5 stars." },
      review: { type: "string", description: "reviews: review text." },
      search: { type: "string", description: "list: free-text search." },
      category: { type: "integer", description: "products: category id filter." },
      tag: { type: "integer", description: "products: tag id filter." },
      product: { type: "integer", description: "reviews: product id filter; orders: product id filter." },
      customer: { type: "integer", description: "orders: customer id filter." },
      after: { type: "string", description: "orders: ISO 8601 lower bound." },
      before: { type: "string", description: "orders: ISO 8601 upper bound." },
      orderby: { type: "string", description: "list: sort field accepted by WooCommerce." },
      order: { type: "string", enum: ["asc", "desc"], description: "list: sort direction." },
      page: { type: "integer", description: "list: page number." },
      per_page: { type: "integer", description: "list: rows per page, 1-100." },
      data: { type: "object", additionalProperties: true, description: "Any other WooCommerce payload field; wins over convenience fields." },
      batch: {
        type: "object",
        additionalProperties: true,
        description: "batch: {create: [...], update: [...], delete: [...]}.",
      },
      force: { type: "boolean", description: "delete: WooCommerce always permanently deletes." },
    },
    output: jsonOutput,
    execute: guarded(async (args, exec) => {
      const resource = ensureAllowed(args.resource, RESOURCES, "resource", i18n, "wp_shop");
      const action = ensureAllowed(args.action, ACTIONS, "action", i18n, resource);
      const signal = exec?.signal;

      // WooCommerce needs separate consumer credentials; fail fast with a hint.
      client.wooAuth();

      const base = basePath(resource, args, i18n);
      const summarize = SUMMARIZE[resource];

      if (action === "batch") {
        const batch = objectParam(args.batch ?? args.data, i18n, "batch");
        if (Object.keys(batch).length === 0) {
          fail(i18n.t("err.badInput", { message: "`batch` must contain create, update or delete arrays" }), {
            code: "wp_bad_request",
          });
        }
        const result = await client.woo(`${base}/batch`, { method: "POST", body: batch, signal });
        return ok(result, { action, resource, batched: true });
      }

      if (action === "list") {
        const { page, per_page } = paginationQuery(args, config);
        const result = await client.woo(base, {
          query: { ...listQuery(resource, args), page, per_page },
          signal,
          meta: true,
        });
        const items = Array.isArray(result.data) ? result.data : [];
        return ok(items.map(summarize), {
          action,
          resource,
          page,
          perPage: per_page,
          total: result.total,
          totalPages: result.totalPages,
        });
      }

      if (action === "get") {
        const id = requireParam(args, "id", i18n);
        const item = await client.woo(`${base}/${id}`, { signal });
        return ok(item, { action, resource, id });
      }

      if (action === "create") {
        const body = writeBody(resource, args, i18n);
        const created = await client.woo(base, { method: "POST", body, signal });
        return ok(summarize(created), { action, resource, created: true, id: created?.id });
      }

      if (action === "update") {
        const id = requireParam(args, "id", i18n);
        const body = writeBody(resource, args, i18n);
        const updated = await client.woo(`${base}/${id}`, { method: "POST", body, signal });
        return ok(summarize(updated), { action, resource, updated: true, id });
      }

      assertDestructive(config, i18n);
      const id = requireParam(args, "id", i18n);
      const deleted = await client.woo(`${base}/${id}`, {
        method: "DELETE",
        query: { force: true },
        signal,
      });
      return ok(
        {
          deleted: true,
          resource,
          id,
          previous: deleted?.previous ? summarize(deleted.previous) : undefined,
        },
        { action, resource },
      );
    }),
    presentCall: (args) => ({
      card: "generic",
      title: `WooCommerce ${args.resource}: ${args.action}${args.id ? ` #${args.id}` : ""}`,
      kind: ["create", "update", "delete", "batch"].includes(args.action) ? "execute" : "read",
    }),
  };
}
