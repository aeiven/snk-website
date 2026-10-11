import { InsurableValuation } from "@/components/valuation/insurable/InsurableValuation"

export const metadata = {
    title: "Insurable Value",
};

export default function InsurableValuePage() {
    return (
        <section className="w-full min-h-screen bg-fixed bg-[url('/images/w214.jpg')] bg-cover bg-center font-onest">
            <InsurableValuation />
        </section>
    )
}
