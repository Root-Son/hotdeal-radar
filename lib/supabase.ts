import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

/** 가격 스냅샷 저장 */
export async function saveSnapshot(product: {
  productKey: string;
  productName: string;
  price: number;
  productUrl?: string;
  imageUrl?: string;
}) {
  const { error } = await supabase
    .from("price_snapshots")
    .upsert(
      {
        product_key: product.productKey,
        product_name: product.productName,
        price: product.price,
        product_url: product.productUrl,
        image_url: product.imageUrl,
        source: "coupang",
        recorded_at: new Date().toISOString().split("T")[0],
      },
      { onConflict: "product_key,recorded_at" }
    );

  if (error) console.error("Snapshot save error:", error.message);
}

/** 최근 N일 가격 히스토리 조회 */
export async function getPriceHistory(
  productKey: string,
  days = 30
): Promise<{ date: string; price: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("price_snapshots")
    .select("recorded_at, price")
    .eq("product_key", productKey)
    .gte("recorded_at", since.toISOString().split("T")[0])
    .order("recorded_at", { ascending: true });

  if (error || !data) return [];

  return data.map((r) => ({ date: r.recorded_at, price: r.price }));
}

/** 해당 제품의 역대 최저가 조회 */
export async function getLowestEver(
  productKey: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("price_snapshots")
    .select("price")
    .eq("product_key", productKey)
    .order("price", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0].price;
}
