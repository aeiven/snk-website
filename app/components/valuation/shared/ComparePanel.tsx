"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Scale, X } from "lucide-react"
import { COMPARE_EVENT, loadResult, PAGE_LINKS, ResultKind, StoredResult } from "./compareStore"

const formatPrice = (price: number) => price > 0 ? `RM ${price.toLocaleString()}` : "No Data"

function ResultCard({ kind, result }: { kind: ResultKind; result: StoredResult | null }) {
    const { href, title } = PAGE_LINKS[kind]
    return (
        <div className="rounded-xl border border-brand-light-grey p-3 flex flex-col gap-2">
            <h4 className="font-bold text-brand">{title}</h4>
            {result ? (
                <>
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        {result.selections.map(s => (
                            <div key={s.label} className="contents">
                                <dt className="text-brand-grey">{s.label}</dt>
                                <dd className="font-medium">{s.value || '-'}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="grid grid-cols-3 gap-1 text-center text-xs">
                        <div className="rounded-lg bg-green-50 p-1"><p className="text-green-700">Lowest</p><p className="font-bold">{formatPrice(result.lowest)}</p></div>
                        <div className="rounded-lg bg-blue-50 p-1"><p className="text-blue-700">Average</p><p className="font-bold">{formatPrice(result.average)}</p></div>
                        <div className="rounded-lg bg-purple-50 p-1"><p className="text-purple-700">Highest</p><p className="font-bold">{formatPrice(result.highest)}</p></div>
                    </div>
                    <p className="text-[11px] text-brand-grey">
                        {kind === 'market' ? 'Listings as of' : 'Checked on'} {new Date(result.date).toLocaleString()}
                        {result.listingCount !== undefined && ` · ${result.listingCount} listings`}
                    </p>
                </>
            ) : (
                <p className="text-sm text-brand-grey">
                    Not checked yet in this tab. <Link href={href} className="text-brand underline">Go to {title}</Link> (1 token).
                </p>
            )}
        </div>
    )
}

// Free side panel showing the last Insurable Value and Current Market Valuation results side by side.
export function ComparePanel() {
    const [open, setOpen] = useState(false)
    const [insurable, setInsurable] = useState<StoredResult | null>(null)
    const [market, setMarket] = useState<StoredResult | null>(null)

    useEffect(() => {
        const refresh = () => { setInsurable(loadResult('insurable')); setMarket(loadResult('market')) }
        refresh()
        window.addEventListener(COMPARE_EVENT, refresh)
        return () => window.removeEventListener(COMPARE_EVENT, refresh)
    }, [])

    if (!insurable && !market) return null

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="fixed right-6 bottom-28 z-50 flex items-center gap-2 px-4 py-3 bg-brand text-brand-white rounded-full shadow-lg hover:bg-brand/90 transition-colors print:hidden"
            >
                <Scale className="w-5 h-5" /> Compare
            </button>

            {open && (
                <div className="fixed inset-0 z-[60] print:hidden" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
                    <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-brand-white shadow-2xl p-4 flex flex-col gap-4 overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-brand flex items-center gap-2"><Scale className="w-5 h-5" /> Compare</h3>
                            <button onClick={() => setOpen(false)} aria-label="Close"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-xs text-brand-grey">
                            These two values come from different data. Check that the details on both sides describe the same vehicle.
                        </p>
                        <ResultCard kind="insurable" result={insurable} />
                        <ResultCard kind="market" result={market} />
                    </aside>
                </div>
            )}
        </>
    )
}
