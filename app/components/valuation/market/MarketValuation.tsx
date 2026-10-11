"use client"

import { useEffect, useState } from "react"
import { ArrowDown, RotateCcw } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import SearchableSelect from "@/components/ui/SearchableSelect"
import { Button } from "@/components/ui/ButtonComponent"
import { scrollToElement } from "@/app/components/ui/SmoothScroll"
import { FormSelect } from "../cars/CarValuationNew"
import UnifiedListingsDisplay from "../listings/MainValuationContainer"
import { ValuationPageShell } from "../shared/ValuationPageShell"
import { CheckOtherPrompt } from "../shared/CheckOtherPrompt"
import { saveResult } from "../shared/compareStore"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''

interface FilterOptions {
    variants: { label: string; slug: string; count: number }[]
    body_types: { label: string; slug: string }[]
    years: string[]
    transmissions: string[]
}

const EMPTY_OPTIONS: FilterOptions = { variants: [], body_types: [], years: [], transmissions: [] }
const CONDITIONS = [{ value: "used", label: "Used" }, { value: "new", label: "New" }, { value: "recon", label: "Recon" }]
const label = (slug: string) => slug.replace(/-/g, ' ').toUpperCase()
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Current Market Valuation page: every option is the market source's own filter value,
// so the search uses exactly what the user picked (no matching against our database wording).
export function MarketValuation() {
    const { refreshTokens, getAccessToken } = useAuth()

    const [makes, setMakes] = useState<string[]>([])
    const [models, setModels] = useState<{ value: string; label: string }[]>([])
    const [options, setOptions] = useState<FilterOptions>(EMPTY_OPTIONS)

    const [make, setMake] = useState("")
    const [model, setModel] = useState("")
    const [variantSlug, setVariantSlug] = useState("")
    const [bodySlug, setBodySlug] = useState("")
    const [year, setYear] = useState("")
    const [condition, setCondition] = useState("used")
    const [transmission, setTransmission] = useState("")

    const [loadingOptions, setLoadingOptions] = useState(false)
    const [searching, setSearching] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [results, setResults] = useState<{ listings: any[]; asOf: string | null; userInputs: any } | null>(null)

    useEffect(() => {
        fetch(`${API_BASE}/api/market/options/makes`).then(r => r.ok ? r.json() : null).then(d => setMakes(d?.makes || []))
    }, [])

    useEffect(() => {
        setModels([]); setModel("")
        if (make) fetch(`${API_BASE}/api/market/options/models?make=${encodeURIComponent(make)}`).then(r => r.ok ? r.json() : null).then(d => setModels(d?.models || []))
    }, [make])

    // Variant, body type, year and transmission lists for the chosen make + model
    useEffect(() => {
        setOptions(EMPTY_OPTIONS); setVariantSlug(""); setBodySlug(""); setYear(""); setTransmission("")
        if (!model) return
        const load = async () => {
            setLoadingOptions(true)
            try {
                const accessToken = await getAccessToken()
                const res = await fetch(`${API_BASE}/api/market/options/filters?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                })
                const data = await res.json().catch(() => null)
                if (!res.ok) { setError(data?.detail || "Could not load the options."); return }
                setError(null)
                setOptions({ ...EMPTY_OPTIONS, ...data })
                if (data.variants?.length === 1) setVariantSlug(data.variants[0].slug)
                if (data.body_types?.length === 1) setBodySlug(data.body_types[0].slug)
            } finally {
                setLoadingOptions(false)
            }
        }
        load()
    }, [make, model])

    const modelLabel = models.find(m => m.value === model)?.label || label(model)
    const variantLabel = options.variants.find(v => v.slug === variantSlug)?.label || ""
    const bodyLabel = options.body_types.find(b => b.slug === bodySlug)?.label || ""

    const resetAll = () => { setMake(""); setCondition("used"); setResults(null); setError(null) }

    const handleSubmit = async () => {
        if (!make || !model) { setError("Please select the make and model."); return }
        setSearching(true); setError(null); setResults(null)
        try {
            const accessToken = await getAccessToken()
            if (!accessToken) { setError("Please log in again."); return }
            const res = await fetch(`${API_BASE}/api/valuation/market`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({
                    make, model, condition,
                    variant_slug: variantSlug || null,
                    body_slug: bodySlug || null,
                    year: year ? parseInt(year) : null,
                    transmission: transmission || null,
                }),
            })
            const data = await res.json().catch(() => null)
            if (!res.ok) { setError(data?.detail || "Something went wrong. Please try again."); return }
            await refreshTokens()

            const listings: any[] = Array.isArray(data.listings) ? data.listings : []
            const userInputs = {
                make: label(make), model: modelLabel, year, variant: variantLabel, style: bodyLabel,
                transmission: transmission ? capitalize(transmission) : "", condition: capitalize(condition),
            }
            setResults({ listings, asOf: data.as_of, userInputs })

            // Same figures the results section shows: lowest, highest and the midpoint between them
            const prices = listings.map(l => Number(l.price)).filter(p => p > 0)
            if (prices.length > 0) {
                const lowest = Math.min(...prices), highest = Math.max(...prices)
                saveResult({
                    kind: 'market',
                    selections: [
                        { label: 'Make', value: userInputs.make }, { label: 'Model', value: userInputs.model },
                        { label: 'Variant', value: variantLabel }, { label: 'Body Type', value: bodyLabel },
                        { label: 'Year', value: year }, { label: 'Condition', value: userInputs.condition },
                    ],
                    lowest, highest, average: Math.round((lowest + highest) / 2),
                    date: data.as_of || new Date().toISOString(),
                    listingCount: prices.length,
                })
            }
            setTimeout(() => scrollToElement("results"), 100)
        } catch (e: any) {
            setError(e?.message || "Something went wrong. Please try again.")
        } finally {
            setSearching(false)
        }
    }

    const field = (text: string, loading?: boolean) => (
        <label className="block text-sm font-medium mb-1">{text} {loading && <span className="text-xs text-foreground/50">Loading...</span>}</label>
    )
    const noOptions = !model || loadingOptions

    return (
        <ValuationPageShell title="Current Market Valuation">
            <div className="rounded-2xl md:rounded-3xl border border-foreground/40 shadow-sm p-4 md:p-6 bg-brand-white">
                <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
                    <div className="flex flex-col gap-1 pb-3 border-b-2 border-brand/20">
                        <h3 className="text-lg font-bold text-brand">Vehicle Details</h3>
                        <p className="text-xs">Market value is based on vehicles currently listed for sale.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            {field("*Make")}
                            <SearchableSelect value={make} onChange={setMake} options={makes.map(m => ({ value: m, label: label(m) }))} placeholder="Select a make..." isLoading={makes.length === 0} />
                        </div>
                        <div>
                            {field("*Model")}
                            <SearchableSelect value={model} onChange={setModel} options={models} placeholder="Select a model..." disabled={!make} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            {field("Variant", loadingOptions)}
                            <FormSelect value={variantSlug} onChange={(e) => setVariantSlug(e.target.value)} disabled={noOptions || options.variants.length === 0} options={options.variants.map(v => ({ value: v.slug, label: v.label }))} />
                        </div>
                        <div>
                            {field("Body Type", loadingOptions)}
                            <FormSelect value={bodySlug} onChange={(e) => setBodySlug(e.target.value)} disabled={noOptions || options.body_types.length === 0} options={options.body_types.map(b => ({ value: b.slug, label: b.label }))} />
                        </div>
                        <div>
                            {field("Year", loadingOptions)}
                            <FormSelect value={year} onChange={(e) => setYear(e.target.value)} disabled={noOptions || options.years.length === 0} options={options.years} />
                        </div>
                        <div>
                            {field("*Condition")}
                            <FormSelect value={condition} onChange={(e) => setCondition(e.target.value || "used")} disabled={!model} options={CONDITIONS} />
                        </div>
                        <div>
                            {field("Transmission", loadingOptions)}
                            <FormSelect value={transmission} onChange={(e) => setTransmission(e.target.value)} disabled={noOptions || options.transmissions.length === 0} options={options.transmissions.map(t => ({ value: t, label: capitalize(t) }))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                        <Button type="button" onClick={handleSubmit} disabled={searching || loadingOptions} variant="secondary" size="sm" className="w-full text-lg md:text-xl flex justify-center gap-2">
                            {searching ? "Searching..." : "Get Market Value"} <ArrowDown className="h-5 w-5" />
                        </Button>
                        <Button type="button" onClick={resetAll} variant="secondary" size="sm" className="w-full text-lg md:text-xl flex justify-center items-center gap-2">
                            Reset <RotateCcw className="h-5 w-5" />
                        </Button>
                    </div>
                    {loadingOptions && <p className="text-sm text-center text-foreground/60">Loading the options for this model. The first time a model is chosen this can take up to a minute.</p>}
                    {searching && <p className="text-sm text-center text-foreground/60">This can take up to a minute when the listings have not been checked recently.</p>}
                    {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                </form>
            </div>

            <div id="results">
                {results && (
                    <div className="rounded-2xl md:rounded-3xl border border-foreground/40 p-4 md:p-6 bg-brand-white flex flex-col gap-4">
                        {results.asOf && (
                            <p className="text-xs text-brand-grey text-right">Listings as of {new Date(results.asOf).toLocaleString()}</p>
                        )}
                        <UnifiedListingsDisplay listings={results.listings} userInputs={results.userInputs} showInsurable={false} />
                        <CheckOtherPrompt target="insurable" />
                    </div>
                )}
            </div>
        </ValuationPageShell>
    )
}
