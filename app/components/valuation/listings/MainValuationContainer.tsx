// Container to display market listings. The server sends them already in this neutral shape;
// source, url and image are only included for admins.

import { Car, CircleDollarSign, HandCoins, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useMemo, useEffect, useRef } from 'react'
import UnifiedGridView from './ValuationListings'
import UserInputsDisplay from '../shared/UserInputsDisplay'
import { useAuth } from '@/context/AuthContext'

export function SortButton({
    mode,
    viewMode,
    setViewMode,
    icon,
    text
}: {
    mode: 'ascending' | 'descending',
    viewMode: 'ascending' | 'descending',
    setViewMode: (viewMode: 'ascending' | 'descending') => void,
    icon: React.ReactNode,
    text: string
}) {
    const isActive = viewMode === mode;
    return (
        <button
            onClick={() => setViewMode(mode)}
            className={`flex items-center gap-2 p-2 text-sm md:px-4 md:py-2 md:text-base rounded-full font-medium transition-ring-color duration-200 ease-in-out ${isActive
                ? 'bg-brand text-brand-white'
                : 'ring-1 ring-brand-light-grey/50 hover:ring-brand-light-grey bg-gray-100 text-brand-grey hover:bg-gray-200'
                }`}
        >
            {icon}
            {text}
        </button>
    )
}

export function PriceContainer({
    title,
    price,
    color,
}: {
    title: string,
    price: string,
    color: 'lowest' | 'highest' | 'average',
}) {
    return (
        <div className={`rounded-xl md:rounded-2xl flex justify-between sm:items-center md:flex-col print:flex-col bg-gradient-to-br ${color === 'lowest' ? 'from-green-50 to-green-100 border border-green-200' : color === 'highest' ? 'from-purple-50 to-purple-100 border border-purple-200' : 'from-blue-50 to-blue-100 border border-blue-200'} p-2 md:p-4`}>
            <p className={`text-sm font-medium ${color === 'lowest' ? 'text-green-700' : color === 'highest' ? 'text-purple-700' : 'text-blue-700'}`}>{title}</p>
            <p className={`print:text-3xl md:text-4xl font-bold ${color === 'lowest' ? 'text-green-900' : color === 'highest' ? 'text-purple-900' : 'text-blue-900'}`}>{price}</p>
        </div>
    )
}

interface UnifiedListing {
    id: string
    source?: 'Mudah' | 'Carlist'
    make: string
    model: string
    region?: string
    variant?: string
    year: string | number
    price: number
    mileage?: string | { gte: string; lte: string }
    transmission?: string
    fuelType?: string
    condition?: string
    bodyType?: string
    engineCapacity?: string
    image?: string
    url?: string
}

interface UnifiedListingsDisplayProps {
    listings: any[]
    listingsAscending?: any[]
    listingsDescending?: any[]
    vehicleType?: 'car' | 'motorcycle'
    source?: string
    counts?: {
        mudah?: number
        carlist?: number
        total?: number
        duplicatesRemoved?: number
    }
    userInputs?: {
        make: string
        model: string
        region?: string
        year?: string
        fuelType?: string
        transmission?: string
        origin?: string
        condition?: string
        mileage?: string
        insuredPrice?: string
        variant?: string
        style?: string
        cc?: string
        electricMotorWatts?: string
    }
    insurableData?: any
}

const normalizeListing = (listing: any): UnifiedListing | null => {
    if (!listing || typeof listing !== 'object' || !listing.id) {
        console.warn("Invalid listing object:", listing)
        return null
    }
    return { ...listing, price: Number(listing.price) || 0 }
}

export default function UnifiedListingsDisplay({
    listings = [],
    listingsAscending = [],
    listingsDescending = [],
    vehicleType = 'car',
    userInputs,
    insurableData
}: UnifiedListingsDisplayProps) {

    const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
    const [viewMode, setViewMode] = useState<'ascending' | 'descending'>('ascending')
    const [sourceFilter, setSourceFilter] = useState<'all' | 'mudah' | 'carlist'>('all')
    const [isFloating, setIsFloating] = useState(false)
    const [shouldShowFloating, setShouldShowFloating] = useState(false)
    const priceContainerRef = useRef<HTMLDivElement>(null)
    
    const [currentPage, setCurrentPage] = useState(1)
    const ITEMS_PER_PAGE = 30

    useEffect(() => {
        setCurrentPage(1)
    }, [viewMode, sourceFilter, listings])

    const normalizedListings = useMemo(() => {
        return listings.map(normalizeListing).filter((listing): listing is UnifiedListing => listing !== null)
    }, [listings])

    const displayListings = useMemo(() => {
        let source = normalizedListings
        let filtered = source.filter(listing => !removedIds.has(listing.id))
        if (sourceFilter !== 'all') {
            filtered = filtered.filter(listing => listing.source?.toLowerCase() === sourceFilter)
        }
        return [...filtered].sort((a, b) => {
            if (viewMode === 'ascending') { return a.price - b.price } 
            else { return b.price - a.price }
        })
    }, [viewMode, normalizedListings, removedIds, sourceFilter])

    const paginatedListings = useMemo(() => {
        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
        return displayListings.slice(startIdx, startIdx + ITEMS_PER_PAGE)
    }, [displayListings, currentPage])

    const totalPages = Math.ceil(displayListings.length / ITEMS_PER_PAGE) || 1

    const removeListing = (id: string) => {
        setRemovedIds(prev => new Set(prev).add(id))
    }

    const sourceCounts = useMemo(() => {
        const allListings = normalizedListings
        const mudah = allListings.filter(l => l.source === 'Mudah').length
        const carlist = allListings.filter(l => l.source === 'Carlist').length
        return { mudah, carlist, total: mudah + carlist }
    }, [normalizedListings])

    useEffect(() => {
        const handleScroll = () => {
            if (priceContainerRef.current) {
                const rect = priceContainerRef.current.getBoundingClientRect()
                const shouldFloat = rect.top < 0
                if (shouldFloat !== isFloating) {
                    setIsFloating(shouldFloat)
                    if (shouldFloat) {
                        setShouldShowFloating(true)
                    } else {
                        setTimeout(() => { setShouldShowFloating(false) }, 300)
                    }
                }
            }
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [isFloating])

    const formatPrice = (price: number) => {
        return `RM ${price.toLocaleString()}`
    }

    const validPrices = displayListings.map(l => l.price).filter(p => typeof p === 'number' && p > 0)
    let lowestPrice = 0
    let highestPrice = 0
    let averagePrice = 0

    if (validPrices.length > 0) {
        lowestPrice = Math.min(...validPrices)
        highestPrice = Math.max(...validPrices)
        
        let baseAveragePrice = Math.round((lowestPrice + highestPrice) / 2)
        averagePrice = baseAveragePrice

        if (userInputs?.region === "east") {
            averagePrice = Math.round(baseAveragePrice * 1.05)
        } else if (userInputs?.region === "langkawi") {
            averagePrice = baseAveragePrice
        }

        if (userInputs?.condition) {
            const condition_name = userInputs.condition
            const lowPercentage = 0.1
            const highPercentage = 0.2
            if (condition_name === "Very Poor") { averagePrice = Math.round(averagePrice * (1 - highPercentage)) }
            else if (condition_name === "Poor") { averagePrice = Math.round(averagePrice * (1 - lowPercentage)) }
            else if (condition_name === "Good") { averagePrice = Math.round(averagePrice * (1 + lowPercentage)) }
            else if (condition_name === "Very Good") { averagePrice = Math.round(averagePrice * (1 + highPercentage)) }
        }
    }

    const PriceSummary = ({ className = "" }: { className?: string }) => (
        <div className={`grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 print:gap-2 gap-2 md:gap-4 ${className}`}>
            <PriceContainer title="Lowest Price" price={formatPrice(lowestPrice)} color="lowest" />
            <PriceContainer title="Average Price" price={formatPrice(averagePrice)} color="average" />
            <PriceContainer title="Highest Price" price={formatPrice(highestPrice)} color="highest" />
        </div>
    )

    const InsurableValue = ({ className = "", data }: { className?: string, data?: any }) => {
        const lowest = data?.lowest || 0;
        const average = data?.average || 0;
        const highest = data?.highest || 0;
        return (
            <div className={`grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 print:gap-2 gap-2 md:gap-4 ${className}`}>
                <PriceContainer title="Lowest Insurable Value" price={lowest > 0 ? formatPrice(lowest) : "No Data"} color="lowest" />
                <PriceContainer title="Average Insurable Value" price={average > 0 ? formatPrice(average) : "No Data"} color="average" />
                <PriceContainer title="Highest Insurable Value" price={highest > 0 ? formatPrice(highest) : "No Data"} color="highest" />
            </div>
        )
    }
    
    const { user } = useAuth();
    
    // CRITICAL FIX: The entire component now structures itself so it NEVER hides the Insurable Value,
    // regardless of whether the market scrapers found 0 cars.
    return (
        <div className="flex flex-col print:gap-2 gap-4">
            
            {/* User vehicle details - ALWAYS SHOWN */}
            {userInputs && (
                <UserInputsDisplay
                    make={userInputs.make}
                    model={userInputs.model}
                    year={userInputs.year}
                    region={userInputs.region}
                    vehicleType={vehicleType}
                    fuelType={userInputs.fuelType}
                    transmission={userInputs.transmission}
                    origin={userInputs.origin}
                    condition={userInputs.condition}
                    mileage={userInputs.mileage}
                    insuredPrice={userInputs.insuredPrice}
                    variant={userInputs.variant}
                    style={userInputs.style}
                    cc={userInputs.cc}
                    electricMotorWatts={userInputs.electricMotorWatts}
                />
            )}

            {/* Insurable values container - ALWAYS SHOWN */}
            <div className="rounded-xl border border-brand-light-grey flex flex-col gap-4 print:gap-2 p-2 print:p-2 md:p-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-100">
                        <HandCoins className="w-5 h-5 text-purple-900" />
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-foreground">Insurable Value</h3>
                </div>
                <InsurableValue data={insurableData} />
                <p className="text-xs">Vehicle insurable value is based on SNK's master database.</p>
            </div>

            {/* CONDITIONAL MARKET DATA DISPLAY */}
            {displayListings.length > 0 ? (
                <>
                    {/* Floating price container */}
                    {shouldShowFloating && (
                        <div className={`hidden md:block print:hidden fixed top-22 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-6xl px-4 transition-all duration-300 ease-out ${isFloating
                            ? 'animate-in slide-in-from-top-4 fade-in'
                            : 'animate-out slide-out-to-top-4 fade-out'
                            }`}>
                            <div className="bg-brand-white rounded-3xl p-4 shadow-2xl border border-brand-light-grey backdrop-blur-sm">
                                <PriceSummary className="mb-0" />
                            </div>
                        </div>
                    )}

                    {/* Market value container */}
                    <div ref={priceContainerRef} className="rounded-xl border border-brand-light-grey flex flex-col gap-4 print:gap-2 p-2 print:p-2 md:p-4">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-purple-100">
                                <CircleDollarSign className="w-5 h-5 text-purple-900" />
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-foreground">Estimated Market Value</h3>
                        </div>
                        <PriceSummary />
                    </div>

                    {/* Controls Section */}
                    <div className="rounded-xl border border-brand-light-grey p-2 md:p-4 flex flex-col gap-4 print:hidden">
                        <div className="flex flex-col gap-4">
                            {displayListings.length > 1 && (
                                <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-700">View:</span>
                                    </div>
                                    <div className="flex flex-col md:flex-row gap-2">
                                        <SortButton mode="ascending" viewMode={viewMode} setViewMode={setViewMode} icon={<ArrowUp className="sm:hidden md:block w-4 h-4" />} text="Price: Low to High" />
                                        <SortButton mode="descending" viewMode={viewMode} setViewMode={setViewMode} icon={<ArrowDown className="sm:hidden md:block w-4 h-4" />} text="Price: High to Low" />
                                    </div>
                                </div>
                            )}

                            {user?.role === 'admin' && sourceCounts.mudah > 0 && sourceCounts.carlist > 0 && (
                                <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3">
                                    <span className="font-medium text-gray-700">Filter by Source:</span>
                                    <div className="flex flex-col md:flex-row gap-2">
                                        <button onClick={() => setSourceFilter('all')} className={`px-4 py-2 rounded-full font-medium transition-ring-color duration-200 ease-in-out ${sourceFilter === 'all' ? 'bg-brand text-white' : 'ring-1 ring-brand-light-grey/50 hover:ring-brand-light-grey bg-gray-100 text-brand-grey hover:bg-gray-200'}`}>
                                            All ({sourceCounts.total})
                                        </button>
                                        <button onClick={() => setSourceFilter('mudah')} className={`px-4 py-2 rounded-full font-medium transition-ring-color duration-200 ease-in-out ${sourceFilter === 'mudah' ? 'bg-blue-600 text-white' : 'ring-1 ring-blue-300 hover:ring-blue-700 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                                            Mudah ({sourceCounts.mudah})
                                        </button>
                                        <button onClick={() => setSourceFilter('carlist')} className={`px-4 py-2 rounded-full font-medium transition-ring-color duration-200 ease-in-out ${sourceFilter === 'carlist' ? 'bg-purple-600 text-white' : 'ring-1 ring-purple-300 hover:ring-purple-700 bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                                            Carlist ({sourceCounts.carlist})
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <div className="flex flex-col text-center md:text-left">
                                    <h6 className="font-semibold text-xl md:text-2xl">
                                        Showing {paginatedListings.length} {paginatedListings.length === 1 ? 'listing' : 'listings'} (Page {currentPage} of {totalPages})
                                        {sourceFilter !== 'all' && ` from ${sourceFilter.charAt(0).toUpperCase() + sourceFilter.slice(1)}`}
                                    </h6>
                                    <p className="text-xs text-foreground/80">Please double check the listings to ensure there are no discrepancies</p>
                                </div>
                            </div>
                        </div>

                        <UnifiedGridView listings={paginatedListings} onRemove={removeListing} vehicleType={vehicleType} />

                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-4 mt-6">
                                <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-brand text-white hover:bg-brand/90'}`}>
                                    <ChevronLeft className="w-4 h-4" /> Previous
                                </button>
                                <span className="font-medium text-gray-700">Page {currentPage} of {totalPages}</span>
                                <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-brand text-white hover:bg-brand/90'}`}>
                                    Next <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                /* EMPTY MARKET STATE - SHOWN BELOW INSURABLE DATA WHEN 0 CARS FOUND */
                <div className="rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center p-12 text-center bg-gray-50/50 mt-4">
                    <Car className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                    <h3 className="text-xl font-bold text-gray-700 mb-2">No Market Listings Found</h3>
                    <p className="text-gray-500 max-w-md">No listings found.</p>
                </div>
            )}
        </div>
    )
}