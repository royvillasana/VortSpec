"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbExtra {
  node: ReactNode;
}

interface BreadcrumbContextValue {
  items: BreadcrumbItem[];
  extras: ReactNode | null;
  setItems: (items: BreadcrumbItem[]) => void;
  setExtras: (extras: ReactNode | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function useBreadcrumb() {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) throw new Error("useBreadcrumb must be used within BreadcrumbProvider");
  return ctx;
}

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  const [extras, setExtras] = useState<ReactNode | null>(null);

  return (
    <BreadcrumbContext.Provider value={{ items, extras, setItems, setExtras }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}
