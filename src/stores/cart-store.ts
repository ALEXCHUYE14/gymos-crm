'use client';

import { create } from 'zustand';
import type { Product } from '@/types/database';

export interface CartLine {
  product: Pick<Product, 'id' | 'name' | 'price' | 'stock'>;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (product: CartLine['product']) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  add: (product) =>
    set((s) => {
      const existing = s.lines.find((l) => l.product.id === product.id);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.product.id === product.id ? { ...l, quantity: Math.min(l.quantity + 1, product.stock) } : l,
          ),
        };
      }
      if (product.stock <= 0) return s;
      return { lines: [...s.lines, { product, quantity: 1 }] };
    }),
  setQuantity: (productId, quantity) =>
    set((s) => ({
      lines: s.lines
        .map((l) =>
          l.product.id === productId ? { ...l, quantity: Math.max(0, Math.min(quantity, l.product.stock)) } : l,
        )
        .filter((l) => l.quantity > 0),
    })),
  remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.product.id !== productId) })),
  clear: () => set({ lines: [] }),
}));

export function cartTotal(lines: CartLine[]) {
  return lines.reduce((acc, l) => acc + Number(l.product.price) * l.quantity, 0);
}
