"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Demo Banner Component
 * 
 * Displays a banner at the top of the page when demo mode is enabled.
 * Shows reset button to clear and reseed demo data.
 * 
 * Only renders when NEXT_PUBLIC_DEMO_MODE === "true"
 */
export function DemoBanner() {
  const [isResetting, setIsResetting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // Access nested Convex module (demo/index.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resetDemo = useAction((api as any)["demo/index"].resetDemo);

  // Prevent hydration mismatch by only rendering after client-side mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Only render if demo mode is enabled and component is mounted
  if (!isMounted || process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return null;
  }

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetDemo({});
      toast.success("Demo data reset successfully");
    } catch (error) {
      console.error("Failed to reset demo data:", error);
      toast.error("Failed to reset demo data");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className={cn(
      "border-b border-yellow-500/50 bg-yellow-500/10 dark:bg-yellow-500/5",
      "px-4 py-3 flex items-center justify-between gap-4"
    )}>
      <div className="flex items-center gap-3">
        <Info className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
            Demo Mode Active
          </p>
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            You're viewing a demo environment. Data resets periodically. Emails are not actually sent.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleReset}
        disabled={isResetting}
        className="shrink-0 border-yellow-600 text-yellow-900 hover:bg-yellow-100 dark:border-yellow-500 dark:text-yellow-100 dark:hover:bg-yellow-500/20"
      >
        {isResetting ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Resetting...
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset Demo Data
          </>
        )}
      </Button>
    </div>
  );
}

