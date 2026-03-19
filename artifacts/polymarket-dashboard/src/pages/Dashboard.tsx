import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RefreshCcw, Activity, Zap, ShieldAlert } from "lucide-react"
import { useActiveMarkets, useSpreadScanner } from "@/hooks/use-polymarket"
import { EventGroupsTab } from "@/components/dashboard/EventGroupsTab"
import { VolumeSpikesTab } from "@/components/dashboard/VolumeSpikesTab"
import { SpreadScannerTab } from "@/components/dashboard/SpreadScannerTab"
import { Button } from "@/components/ui/button"

type TabId = "events" | "spikes" | "spreads";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("events");

  // Fetch base markets
  const { 
    data: markets = [], 
    isLoading: marketsLoading, 
    refetch: refetchMarkets,
    isRefetching: marketsRefetching
  } = useActiveMarkets();

  // Fetch spread orderbooks
  const { 
    data: spreads = [], 
    isLoading: spreadsLoading, 
    refetch: refetchSpreads,
    isRefetching: spreadsRefetching
  } = useSpreadScanner(markets);

  const handleRefresh = () => {
    if (activeTab === "spreads") {
      refetchSpreads();
    } else {
      refetchMarkets();
    }
  };

  const isGlobalLoading = marketsLoading;
  const isCurrentTabRefetching = activeTab === "spreads" ? spreadsRefetching : marketsRefetching;

  const tabs = [
    { id: "events" as TabId, label: "Event Groups", icon: Activity },
    { id: "spikes" as TabId, label: "Volume Spikes", icon: Zap },
    { id: "spreads" as TabId, label: "Spread Scanner", icon: ShieldAlert },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
                <Activity className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                  Polymarket Intel
                </h1>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  Live Terminal • {markets.length} active markets
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border/50">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors
                    ${activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"}
                  `}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute inset-0 bg-card border border-border shadow-sm rounded-lg"
                      initial={false}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <tab.icon size={16} />
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isGlobalLoading || isCurrentTabRefetching}
              className="hidden md:flex bg-secondary/30"
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${isCurrentTabRefetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {isGlobalLoading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground font-mono animate-pulse">Establishing connection to Gamma API...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "events" && <EventGroupsTab markets={markets} />}
              {activeTab === "spikes" && <VolumeSpikesTab markets={markets} />}
              {activeTab === "spreads" && (
                <SpreadScannerTab 
                  spreads={spreads} 
                  isLoading={spreadsLoading || spreadsRefetching} 
                  onRefresh={refetchSpreads} 
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}

      </main>
    </div>
  )
}
