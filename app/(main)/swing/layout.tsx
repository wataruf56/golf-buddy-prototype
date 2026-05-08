import { SwingAccessGate } from '@/components/swing/SwingAccessGate';

export default function SwingLayout({ children }: { children: React.ReactNode }) {
  return <SwingAccessGate>{children}</SwingAccessGate>;
}
