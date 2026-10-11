"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/ButtonComponent"
import { PAGE_LINKS, ResultKind } from "./compareStore"

// Shown under a result: offers the other valuation, with a prompt explaining that the
// details must be entered again because the two pages use different data.
export function CheckOtherPrompt({ target }: { target: ResultKind }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const { href, title } = PAGE_LINKS[target]

    return (
        <>
            <div className="rounded-xl border border-dashed border-brand/40 p-4 flex flex-col md:flex-row items-center justify-between gap-3 bg-brand-white">
                <p className="font-medium text-center md:text-left">Would you also like to check the {title} for this vehicle?</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="flex items-center gap-2">
                    Check {title} <ArrowRight className="w-4 h-4" />
                </Button>
            </div>

            {open && (
                <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="bg-brand-white rounded-2xl max-w-md w-full p-6 flex flex-col gap-4 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <h3 className="text-lg font-bold text-brand">Check {title}</h3>
                            <button onClick={() => setOpen(false)} aria-label="Close"><X className="w-5 h-5" /></button>
                        </div>
                        <ul className="list-disc pl-5 flex flex-col gap-2 text-sm">
                            <li>Insurable value and market value come from different data, so you will need to <b>fill in the vehicle details again</b> on the next page.</li>
                            <li>A result on one page does <b>not guarantee</b> a result on the other.</li>
                            <li>The search uses <b>1 token</b>. Comparing the two results afterwards is free.</li>
                        </ul>
                        <div className="grid grid-cols-2 gap-3">
                            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button type="button" variant="primary" size="sm" onClick={() => router.push(href)}>Continue</Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
