"use client"

import { ReactNode } from "react"
import { FaCar } from "react-icons/fa"
import { ComparePanel } from "./ComparePanel"

// Same frame as the main valuation page, plus the free compare panel.
export function ValuationPageShell({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div id="main" className="w-full bg-black/50 px-4 md:px-12 lg:px-24 pb-8 md:pb-16 pt-24 relative">
            <div className="max-w-6xl mx-auto grid grid-cols-1 gap-4 md:gap-6">
                <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
                    <FaCar className="w-10 h-10 text-brand-element" />
                    <h1 className="text-xl text-center md:text-3xl font-bold text-brand-element">{title}</h1>
                </div>
                {children}
            </div>
            <ComparePanel />
        </div>
    )
}
