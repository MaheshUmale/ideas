import type { ReactNode } from "react";
import Link from "next/link";
import { PRODUCTS, type ProductSlug } from "@/lib/catalog";

export function FactoryHeader() {
  return (
    <header className="border-b border-stone-300 px-6 py-4 flex items-baseline justify-between gap-6">
      <Link href="/" className="text-sm tracking-wide uppercase">
        MVP Software Factory
      </Link>
      <p className="text-sm text-stone-600 hidden md:block">Eight control layers. Zero platform replacements.</p>
    </header>
  );
}

export function ProductChrome({ slug, children }: { slug: ProductSlug; children: ReactNode }) {
  const product = PRODUCTS.find((p) => p.slug === slug)!;
  return (
    <div className="min-h-screen" style={{ ["--accent" as string]: product.accent }}>
      <FactoryHeader />
      <div className="px-6 py-6 border-b border-stone-300 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono text-xs uppercase tracking-widest text-stone-500">0{product.rank} / 08</p>
          <h1 className="text-4xl mt-1">{product.name}</h1>
          <p className="text-stone-700 max-w-xl mt-2">{product.tagline}</p>
        </div>
        <p className="text-sm text-stone-600 max-w-sm">
          Buyer: {product.buyer}. {product.cut}.
        </p>
      </div>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
