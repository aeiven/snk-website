"use client"

import { useState, useMemo, useEffect } from "react"
import { useAuth } from "@/context/AuthContext"
import { ArrowDown, RotateCcw } from 'lucide-react'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { Button } from "@/components/ui/ButtonComponent"
import { mileageOptions } from "../ranges"
import { RegionSelection } from "../shared/RegionSelection"
import { MakeModelPopup } from "../shared/MakeModelPopup"
import { scrollToElement } from "@/app/components/ui/SmoothScroll"

interface CarValuationNewProps {
    onSearch: (searchData: any) => void
    onReset?: () => void
    loading?: boolean
    onSearchStart?: () => void
}

export function FormSelect({ value, onChange, disabled, options, labelFormatter }: {
    value: string
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
    disabled: boolean
    options: string[] | { value: string; label: string }[]
    labelFormatter?: (value: string) => string
}) {
    const normalizedOptions = options.map(option => {
        if (typeof option === 'string') {
            const label = labelFormatter ? labelFormatter(option) : option
            return { value: option, label }
        }
        return option
    }).filter(option => option.value !== 'Any')

    return (
        <select value={value} onChange={onChange} disabled={disabled} className="w-full rounded-full border border-foreground/40 px-3 py-2 outline-none focus:border-brand transition-colors duration-150 disabled:border-foreground/20 disabled:text-foreground/20 disabled:bg-foreground/5">
            <option value="">--</option>
            {normalizedOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    )
}

interface FormBaseProps {
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    disabled: boolean
    placeholder: string
    className?: string
}

type FormTextInputProps = FormBaseProps & (
    | { type: "text" }
    | { type: "number"; max?: number; min?: number; step?: number }
)

export function FormTextInput({ value, onChange, disabled, type, placeholder, className, ...rest }: FormTextInputProps) {
    return (
        <input value={value} onChange={onChange} disabled={disabled} type={type} placeholder={placeholder} className={`w-full rounded-full border border-foreground/40 px-3 py-2 outline-none focus:border-brand transition-colors duration-150 disabled:border-foreground/20 disabled:text-foreground/20 ${className}`} {...rest} />
    )
}

export function CarValuationNew({ onSearch, onReset, loading = false, onSearchStart }: CarValuationNewProps) {
    const { refreshTokens, getAccessToken } = useAuth()
    const formatMileage = (value: string) => `${Number(value).toLocaleString()}+`

    const [isLoading, setIsLoading] = useState(false)
    const [make, setMake] = useState("")
    const [model, setModel] = useState("")
    const [region, setRegion] = useState("west")

    const [unifiedMakes, setUnifiedMakes] = useState<string[]>([])
    const [unifiedModels, setUnifiedModels] = useState<string[]>([])

    const [variantOptions, setVariantOptions] = useState<string[]>([])
    const [styleOptions, setStyleOptions] = useState<string[]>([])
    const [availableYears, setAvailableYears] = useState<string[]>([])
    const [importStatusOptions, setImportStatusOptions] = useState<string[]>([])
    
    const [transmissionOptions, setTransmissionOptions] = useState<string[]>([])
    const [ccOptions, setCcOptions] = useState<string[]>([])
    const [wattOptions, setWattOptions] = useState<string[]>([])

    const [loadingMakes, setLoadingMakes] = useState(false)
    const [loadingModels, setLoadingModels] = useState(false)
    const [loadingVariants, setLoadingVariants] = useState(false)
    const [loadingStyles, setLoadingStyles] = useState(false)
    const [loadingYears, setLoadingYears] = useState(false)
    const [loadingSpecs, setLoadingSpecs] = useState(false)

    const [selectedVariant, setSelectedVariant] = useState<string>("")
    const [selectedStyle, setSelectedStyle] = useState<string>("")
    const [yearFrom, setYearFrom] = useState<string>("")
    const [importStatus, setImportStatus] = useState<string>("")
    
    const [fuelType, setFuelType] = useState<string>("")
    const [transmission, setTransmission] = useState<string>("")
    const [selectedCC, setSelectedCC] = useState<string>("")
    const [electricMotorWatts, setElectricMotorWatts] = useState<string>("")
    const [condition, setCondition] = useState<string>("")
    const [mileageFrom, setMileageFrom] = useState<string>("")
    const [insuredPrice, setInsuredPrice] = useState<string>("")
    const [showPopup, setShowPopup] = useState(false)

    const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-")
    const cleanDbString = (s: string) => s.replace(/-/g, ' ').toUpperCase().trim()
    const canSubmit = useMemo(() => make.trim() && model.trim(), [make, model])

    useEffect(() => {
        const fetchAllMakes = async () => {
            setLoadingMakes(true)
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''
                const res = await fetch(`${API_BASE}/api/market/makes?type=car`)
                if (res.ok) setUnifiedMakes((await res.json()).makes || [])
            } catch (e) { console.error(e) } finally { setLoadingMakes(false) }
        }
        fetchAllMakes()
    }, [])

    useEffect(() => {
        if (!make) return
        const fetchAllModels = async () => {
            setLoadingModels(true)
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''
                const res = await fetch(`${API_BASE}/api/market/models?type=car&make=${encodeURIComponent(slug(make))}`)
                if (res.ok) setUnifiedModels((await res.json()).models || [])
            } catch (e) { console.error(e) } finally { setLoadingModels(false) }
        }
        fetchAllModels()
    }, [make])

    useEffect(() => {
        if (!make || !model) { setVariantOptions([]); setSelectedVariant(""); return }
        const fetchVariants = async () => {
            setLoadingVariants(true)
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''
                const res = await fetch(`${API_BASE}/api/valuation/options/variants?make=${cleanDbString(make)}&model=${cleanDbString(model)}`)
                if (res.ok) {
                    const data = await res.json()
                    setVariantOptions(data.variants || [])
                    if (data.variants?.length === 1) setSelectedVariant(data.variants[0])
                }
            } catch (e) { console.error(e) } finally { setLoadingVariants(false) }
        }
        fetchVariants()
    }, [make, model])

    useEffect(() => {
        if (!make || !model || !selectedVariant) { setStyleOptions([]); setSelectedStyle(""); return }
        const fetchStyles = async () => {
            setLoadingStyles(true)
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''
                const res = await fetch(`${API_BASE}/api/valuation/options/body-types?make=${cleanDbString(make)}&model=${cleanDbString(model)}&variant=${encodeURIComponent(selectedVariant)}`)
                if (res.ok) {
                    const data = await res.json()
                    setStyleOptions(data.body_types || [])
                    if (data.body_types?.length === 1) setSelectedStyle(data.body_types[0])
                }
            } catch (e) { console.error(e) } finally { setLoadingStyles(false) }
        }
        fetchStyles()
    }, [make, model, selectedVariant])

    useEffect(() => {
        if (!make || !model || !selectedVariant || !selectedStyle) { setAvailableYears([]); setYearFrom(""); return }
        const fetchYears = async () => {
            setLoadingYears(true)
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''
                const res = await fetch(`${API_BASE}/api/valuation/options/years?make=${cleanDbString(make)}&model=${cleanDbString(model)}&variant=${encodeURIComponent(selectedVariant)}&style=${encodeURIComponent(selectedStyle)}`)
                if (res.ok) {
                    const data = await res.json()
                    setAvailableYears((data.years || []).map(String))
                    if (data.years?.length === 1) setYearFrom(String(data.years[0]))
                }
            } catch (e) { console.error(e) } finally { setLoadingYears(false) }
        }
        fetchYears()
    }, [make, model, selectedVariant, selectedStyle])

    useEffect(() => {
        if (!make || !model || !selectedVariant || !selectedStyle || !yearFrom) {
            setTransmissionOptions([]); setCcOptions([]); setWattOptions([]); setImportStatusOptions([]);
            setTransmission(""); setSelectedCC(""); setElectricMotorWatts(""); setFuelType(""); setImportStatus(""); return
        }
        const fetchSpecs = async () => {
            setLoadingSpecs(true)
            try {
                const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''
                const res = await fetch(`${API_BASE}/api/valuation/options/variant-specs?make=${cleanDbString(make)}&model=${cleanDbString(model)}&variant=${encodeURIComponent(selectedVariant)}&style=${encodeURIComponent(selectedStyle)}&year=${yearFrom}`)
                if (res.ok) {
                    const data = await res.json()
                    setTransmissionOptions(data.transmissions || [])
                    setCcOptions(data.engine_ccs || [])
                    setWattOptions(data.engine_watts || [])
                    setImportStatusOptions(data.import_statuses || [])
                    
                    const fuels = data.fuel_types || []
                    if (fuels.length > 0) {
                        const fuelMapping: Record<string, string> = { "PETROL": "petrol", "DIESEL": "diesel", "HYBRID": "hybrid", "ELECTRIC": "electric" }
                        const selectedFuel = fuels[0].toUpperCase()
                        setFuelType(fuelMapping[selectedFuel] || "petrol")
                    }

                    if (data.transmissions?.length === 1) setTransmission(data.transmissions[0])
                    if (data.engine_ccs?.length === 1) setSelectedCC(data.engine_ccs[0])
                    if (data.engine_watts?.length === 1) setElectricMotorWatts(data.engine_watts[0])
                    if (data.import_statuses?.length === 1) setImportStatus(data.import_statuses[0])
                }
            } catch (e) { console.error(e) } finally { setLoadingSpecs(false) }
        }
        fetchSpecs()
    }, [make, model, selectedVariant, selectedStyle, yearFrom])

    const resetAll = () => {
        setMake(""); setModel(""); setSelectedVariant(""); setSelectedStyle(""); setYearFrom(""); setImportStatus("")
        setFuelType(""); setTransmission(""); setSelectedCC(""); setElectricMotorWatts(""); setCondition(""); setMileageFrom(""); setInsuredPrice("")
        if (onReset) onReset()
    }

    const handleSubmit = async () => {
        if (!canSubmit) { setShowPopup(true); return }
        // Token check happens on the server, which also applies the weekly refill
        setIsLoading(true)
        if (onSearchStart) onSearchStart()

        try {
            const accessToken = await getAccessToken()
            if (!accessToken) { onSearch({ error: "Authentication error." }); return }

            // Only the vehicle details are sent; the server decides where to search
            const requestBody = {
                vehicle_type: 'car',
                vehicle: {
                    make: slug(make),
                    model: slug(model),
                    year: yearFrom || null,
                    variant: selectedVariant || null,
                    style: selectedStyle || null,
                    cc: (fuelType === 'electric' ? electricMotorWatts : selectedCC) || null,
                    transmission: transmission || null,
                    fuel_type: fuelType || null,
                    import_status: importStatus || null,
                }
            }

            const API_BASE = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : ''
            const response = await fetch(`${API_BASE}/api/valuation/get_marketdata`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => null)
                onSearch({ error: errorData?.detail || `Request failed` }); return
            }

            const data = await response.json()
            await refreshTokens()
            
            const insurableData = data.results?.insurable || null
            const currentUserInputs = { make, model, year: yearFrom, style: selectedStyle, variant: selectedVariant, cc: selectedCC, transmission, fuelType }

            const combinedListings = Array.isArray(data.results?.listings) ? data.results.listings : []

            onSearch({
                listings: combinedListings,
                source: 'Combined', 
                userInputs: currentUserInputs,
                insurable: insurableData,
                counts: { total: combinedListings.length }
            })

        } catch (e: any) {
            onSearch({ error: e?.message || "Something went wrong" })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="rounded-2xl md:rounded-3xl border border-foreground/40 shadow-sm p-4 md:p-6 bg-brand-white">
            <form id="car-form" className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
                <RegionSelection value={region} onChange={setRegion} />

                <div className="flex flex-col gap-1 pb-3 border-b-2 border-brand/20">
                    <h3 className="text-lg font-bold text-brand">Car Make/Model</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-brand font-medium mb-1">*Make</label>
                        <SearchableSelect value={make} onChange={(val) => { setMake(val); setModel(""); setSelectedVariant(""); setSelectedStyle(""); setYearFrom(""); setImportStatus("") }} options={unifiedMakes.map(m => ({ value: m, label: m.replace(/-/g, ' ').toUpperCase() }))} placeholder="Select a make..." disabled={loadingMakes} isLoading={loadingMakes} />
                    </div>
                    <div>
                        <label className="block text-brand font-medium mb-1">*Model</label>
                        <SearchableSelect value={model} onChange={(val) => { setModel(val); setSelectedVariant(""); setSelectedStyle(""); setYearFrom(""); setImportStatus("") }} options={unifiedModels.map(m => ({ value: m, label: m.replace(/-/g, ' ').toUpperCase() }))} placeholder="Select a model..." disabled={!make} isLoading={loadingModels} />
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-1 pb-3 border-b-2 border-brand/20">
                            <h3 className="text-lg font-bold text-brand">Vehicle Identity</h3>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">*Variant {loadingVariants && <span className="text-xs text-foreground/50">Loading...</span>}</label>
                            <FormSelect value={selectedVariant} onChange={(e: any) => { setSelectedVariant(e.target.value); setSelectedStyle(""); setYearFrom(""); setImportStatus("") }} disabled={!model || loadingVariants || variantOptions.length === 0} options={variantOptions.map(v => ({ value: v, label: v }))} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">*Body Type {loadingStyles && <span className="text-xs text-foreground/50">Loading...</span>}</label>
                            <FormSelect value={selectedStyle} onChange={(e: any) => { setSelectedStyle(e.target.value); setYearFrom(""); setImportStatus("") }} disabled={!selectedVariant || loadingStyles || styleOptions.length === 0} options={styleOptions.map(s => ({ value: s, label: s }))} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">*Year {loadingYears && <span className="text-xs text-foreground/50">Loading...</span>}</label>
                            <FormSelect value={yearFrom} onChange={(e: any) => { setYearFrom(e.target.value); setImportStatus("") }} disabled={!selectedStyle || loadingYears || availableYears.length === 0} options={availableYears} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">*Import Status {loadingSpecs && <span className="text-xs text-foreground/50">Loading...</span>}</label>
                            <FormSelect value={importStatus} onChange={(e: any) => setImportStatus(e.target.value)} disabled={!yearFrom || loadingSpecs || importStatusOptions.length === 0} options={importStatusOptions.map(st => ({ value: st, label: st }))} />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-1 pb-3 border-b-2 border-brand/20">
                            <h3 className="text-lg font-bold text-brand">Technical Specifications</h3>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">*Fuel Type</label>
                            <FormSelect value={fuelType} onChange={(e: any) => setFuelType(e.target.value)} disabled={!model} options={[{ value: "petrol", label: "Petrol" }, { value: "diesel", label: "Diesel" }, { value: "hybrid", label: "Hybrid" }, { value: "electric", label: "Electric" }]} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">*Transmission {loadingSpecs && <span className="text-xs text-foreground/50">Loading...</span>}</label>
                            <FormSelect value={transmission} onChange={(e: any) => setTransmission(e.target.value)} disabled={!yearFrom || loadingSpecs || transmissionOptions.length === 0} options={transmissionOptions.map(t => ({ value: t, label: t }))} />
                        </div>
                        {fuelType !== "electric" ? (
                            <div>
                                <label className="block text-sm font-medium mb-1">*Engine Capacity (cc)</label>
                                <FormSelect value={selectedCC} onChange={(e: any) => setSelectedCC(e.target.value)} disabled={!yearFrom || loadingSpecs || ccOptions.length === 0} options={ccOptions.map(c => ({ value: c, label: `${c} cc` }))} />
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium mb-1">*Engine Power (Watt)</label>
                                <FormSelect value={electricMotorWatts} onChange={(e: any) => setElectricMotorWatts(e.target.value)} disabled={!yearFrom || loadingSpecs || wattOptions.length === 0} options={wattOptions.map(w => ({ value: w, label: `${w} W` }))} />
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-1 pb-3 border-b-2 border-brand/20">
                            <h3 className="text-lg font-bold text-brand">Condition & Value</h3>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">*Condition</label>
                            <FormSelect value={condition} onChange={(e: any) => setCondition(e.target.value)} disabled={!model} options={[{ value: "Very Poor", label: "Very Poor" }, { value: "Poor", label: "Poor" }, { value: "Good", label: "Good" }]} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Mileage (KM)</label>
                            <FormSelect value={mileageFrom} onChange={(e: any) => setMileageFrom(e.target.value)} disabled={!model} options={mileageOptions} labelFormatter={formatMileage} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Previous Insured Sum (MYR)</label>
                            <FormTextInput type="number" max={9999999} placeholder="E.g. 123456" disabled={!model} value={insuredPrice} onChange={(e: any) => setInsuredPrice(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div className="flex pt-4 w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 w-full gap-4">
                        <Button type="button" onClick={() => { handleSubmit(); if (canSubmit) setTimeout(() => scrollToElement("valuation"), 100) }} disabled={loading || isLoading} variant="secondary" size="sm" className="w-full text-lg md:text-xl flex justify-center gap-2">
                            Get Market Value <ArrowDown className="h-5 w-5" />
                        </Button>
                        <Button type="button" onClick={() => { resetAll(); scrollToElement("main") }} variant="secondary" size="sm" className="w-full text-lg md:text-xl flex justify-center items-center gap-2">
                            Reset <RotateCcw className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </form>
            <MakeModelPopup isOpen={showPopup} onClose={() => setShowPopup(false)} />
        </div>
    )
}