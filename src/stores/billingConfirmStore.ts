import { create } from 'zustand';

export type BillingConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

interface BillingConfirmState {
  confirm: BillingConfirmRequest | null;
  setConfirm: (confirm: BillingConfirmRequest | null) => void;
}

export const useBillingConfirmStore = create<BillingConfirmState>((set) => ({
  confirm: null,
  setConfirm: (confirm) => set({ confirm }),
}));
