import { MarketValuation } from "@/components/valuation/market/MarketValuation"

export const metadata = {
    title: "Current Market Valuation",
};

export default function MarketValuationPage() {
    return (
        <section className="w-full min-h-screen bg-fixed bg-[url('/images/w214.jpg')] bg-cover bg-center font-onest">
            <MarketValuation />
        </section>
    )
}
