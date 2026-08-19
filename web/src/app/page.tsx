import Link from "next/link";
import { PRODUCTS } from "@/lib/catalog";
import { FactoryHeader } from "@/components/Chrome";

export default function HomePage() {
  return (
    <div>
      <FactoryHeader />
      <section className="px-6 py-16 max-w-5xl">
        <p className="mono text-xs uppercase tracking-[0.2em] text-stone-500">Phase 1 implementations</p>
        <h1 className="text-5xl md:text-6xl leading-[1.05] mt-3">
          Eight MVPs that fix one broken handoff each.
        </h1>
        <p className="mt-6 text-lg text-stone-700 max-w-2xl">
          Built from the factory blueprints: TypeScript domain engines, deterministic tests, and
          working consoles. Each product stays a control layer on top of software the buyer already
          uses.
        </p>
      </section>
      <ol className="border-t border-stone-300">
        {PRODUCTS.map((product) => (
          <li key={product.slug} className="border-b border-stone-300">
            <Link href={product.href} className="grid md:grid-cols-[5rem_1fr_1fr] gap-4 px-6 py-7 hover:bg-white/60">
              <span className="mono text-sm text-stone-500">0{product.rank}</span>
              <div>
                <h2 className="text-2xl" style={{ color: product.accent }}>
                  {product.name}
                </h2>
                <p className="mt-1 text-stone-700">{product.tagline}</p>
                <p className="mt-2 text-sm text-stone-500">{product.buyer}</p>
              </div>
              <ul className="text-sm text-stone-700 space-y-1">
                {product.features.map((f) => (
                  <li key={f}>— {f}</li>
                ))}
              </ul>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
