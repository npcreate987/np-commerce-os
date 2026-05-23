import { ReactNode } from 'react';
import { CustomerShell } from '@/components/shell/customer-shell';

export default function CustomerLayout({ children }: { children: ReactNode }): JSX.Element {
  return <CustomerShell>{children}</CustomerShell>;
}
