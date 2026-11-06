/**
 * Compact representations for list responses.
 *
 * A full WordPress post object is several kilobytes; a page of twenty would
 * flood the model's context. Lists therefore return the fields a person
 * actually scans, and `get` returns the complete record.
 */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(value) {
  return String(value ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function renderedText(value, limit = 160) {
  const html = typeof value === "string" ? value : value?.rendered ?? "";
  const text = decodeEntities(String(html).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function summarizePost(post) {
  if (!post || typeof post !== "object") return post;
  return {
    id: post.id,
    type: post.type,
    slug: post.slug,
    status: post.status,
    title: renderedText(post.title),
    link: post.link,
    date: post.date,
    modified: post.modified,
    author: post.author,
    featured_media: post.featured_media || undefined,
    parent: post.parent || undefined,
    template: post.template || undefined,
  };
}

export function summarizeMedia(item) {
  const details = item?.media_details ?? {};
  return {
    id: item?.id,
    title: renderedText(item?.title),
    media_type: item?.media_type,
    mime_type: item?.mime_type,
    source_url: item?.source_url,
    alt_text: item?.alt_text || undefined,
    width: details.width,
    height: details.height,
    filesize: details.filesize,
    date: item?.date,
  };
}

export function summarizeTerm(term) {
  return {
    id: term?.id,
    name: decodeEntities(term?.name),
    slug: term?.slug,
    taxonomy: term?.taxonomy,
    count: term?.count,
    parent: term?.parent || undefined,
  };
}

export function summarizeUser(user) {
  return {
    id: user?.id,
    name: user?.name,
    slug: user?.slug,
    roles: user?.roles,
    email: user?.email,
    registered_date: user?.registered_date,
  };
}

export function summarizePlugin(plugin) {
  return {
    plugin: plugin?.plugin,
    name: decodeEntities(plugin?.name),
    status: plugin?.status,
    version: plugin?.version,
    author: renderedText(plugin?.author, 80),
    requires_wp: plugin?.requires_wp || undefined,
    requires_php: plugin?.requires_php || undefined,
  };
}

export function summarizeTheme(theme) {
  return {
    stylesheet: theme?.stylesheet,
    name: renderedText(theme?.name),
    status: theme?.status,
    version: theme?.version,
    author: renderedText(theme?.author, 80),
    template: theme?.template,
  };
}

export function summarizeTemplate(template) {
  return {
    id: template?.id,
    slug: template?.slug,
    theme: template?.theme,
    type: template?.type,
    title: renderedText(template?.title),
    status: template?.status,
    has_theme_file: template?.has_theme_file,
    is_custom: template?.is_custom,
  };
}

export function summarizeProduct(product) {
  return {
    id: product?.id,
    name: decodeEntities(product?.name),
    slug: product?.slug,
    type: product?.type,
    status: product?.status,
    sku: product?.sku,
    price: product?.price,
    regular_price: product?.regular_price,
    sale_price: product?.sale_price,
    stock_status: product?.stock_status,
    stock_quantity: product?.stock_quantity,
    categories: (product?.categories ?? []).map((category) => category?.name).filter(Boolean),
    permalink: product?.permalink,
    date_modified: product?.date_modified,
  };
}

export function summarizeVariation(variation) {
  return {
    id: variation?.id,
    sku: variation?.sku,
    price: variation?.price,
    regular_price: variation?.regular_price,
    sale_price: variation?.sale_price,
    stock_status: variation?.stock_status,
    stock_quantity: variation?.stock_quantity,
    attributes: (variation?.attributes ?? []).map((attribute) => ({
      name: attribute?.name,
      option: attribute?.option,
    })),
  };
}

export function summarizeOrder(order) {
  const billing = order?.billing ?? {};
  return {
    id: order?.id,
    number: order?.number,
    status: order?.status,
    currency: order?.currency,
    total: order?.total,
    date_created: order?.date_created,
    customer_id: order?.customer_id,
    customer: [billing.first_name, billing.last_name].filter(Boolean).join(" ") || undefined,
    email: billing.email || undefined,
    payment_method_title: order?.payment_method_title,
    items: (order?.line_items ?? []).map((line) => ({
      name: line?.name,
      quantity: line?.quantity,
      total: line?.total,
    })),
  };
}

export function summarizeCoupon(coupon) {
  return {
    id: coupon?.id,
    code: coupon?.code,
    discount_type: coupon?.discount_type,
    amount: coupon?.amount,
    usage_count: coupon?.usage_count,
    usage_limit: coupon?.usage_limit,
    date_expires: coupon?.date_expires,
    free_shipping: coupon?.free_shipping,
  };
}

export function summarizeCustomer(customer) {
  return {
    id: customer?.id,
    email: customer?.email,
    first_name: customer?.first_name,
    last_name: customer?.last_name,
    username: customer?.username,
    role: customer?.role,
    orders_count: customer?.orders_count,
    total_spent: customer?.total_spent,
  };
}

export function summarizeReview(review) {
  return {
    id: review?.id,
    product_id: review?.product_id,
    status: review?.status,
    rating: review?.rating,
    reviewer: review?.reviewer,
    reviewer_email: review?.reviewer_email,
    review: renderedText(review?.review, 200),
    date_created: review?.date_created,
  };
}

export function summarizeMenu(menu) {
  return {
    id: menu?.id,
    name: decodeEntities(menu?.name),
    slug: menu?.slug,
    locations: menu?.locations ?? [],
    count: menu?.count,
  };
}
